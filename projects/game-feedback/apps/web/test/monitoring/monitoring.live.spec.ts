import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { expect, test, type Request } from '@playwright/test';

function payload(request: Request) {
  const raw = request.postDataBuffer();
  const body = raw?.[0] === 31 && raw?.[1] === 139 ? gunzipSync(raw) : raw;
  return JSON.parse(body?.toString() ?? '{}') as {
    api_key?: string;
    events?: { event_type: string; event_properties?: Record<string, unknown> }[];
  };
}

// 실제 SDK 전송을 확인한다. 이 파일은 기본 e2e가 수집하지 않는 별도 디렉터리에 둔다.
test('실제 Sentry 오류와 Amplitude 페이지뷰가 개인정보 없이 수집돼야 한다', async ({
  page,
  context,
  baseURL,
}) => {
  const marker = 'monitoring-private-canary';
  await context.addCookies([{ name: 'monitoring-check', value: marker, url: baseURL ?? '' }]);
  const amplitude = page.waitForResponse((response) => {
    if (!new URL(response.url()).hostname.endsWith('amplitude.com') || response.request().method() !== 'POST')
      return false;
    try {
      return (
        payload(response.request()).events?.some((event) => event.event_type === '[Amplitude] Page Viewed') ??
        false
      );
    } catch {
      return false;
    }
  });
  await page.goto('/ko?q=' + marker, { waitUntil: 'domcontentloaded' });
  const amplitudeResponse = await amplitude;
  const batch = payload(amplitudeResponse.request());
  const accepted = (await amplitudeResponse.json()) as {
    code: number;
    events_ingested: number;
    server_upload_time: number;
  };
  expect(amplitudeResponse.status()).toBe(200);
  expect(accepted.code).toBe(200);
  expect(accepted.events_ingested).toBeGreaterThan(0);
  expect(batch.api_key === process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY).toBe(true);
  expect(JSON.stringify(batch.events).includes(marker)).toBe(false);
  expect(
    batch.events?.find((event) => event.event_type === '[Amplitude] Page Viewed')?.event_properties,
  ).toMatchObject({ screen: 'feed', client: 'browser' });

  const sentry = page.waitForResponse(
    (response) =>
      new URL(response.url()).hostname.endsWith('sentry.io') &&
      response.request().method() === 'POST' &&
      (response.request().postData()?.includes('MonitoringVerificationError') ?? false),
  );
  await page.evaluate((canary) => {
    setTimeout(() => {
      const error = new Error(canary);
      error.name = 'MonitoringVerificationError';
      throw error;
    }, 0);
  }, marker);
  const sentryResponse = await sentry;
  const envelope = sentryResponse.request().postData() ?? '';
  const lines = envelope.split('\n');
  const event = lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return {};
      }
    })
    .find((item) => item.exception);
  expect(sentryResponse.ok()).toBe(true);
  expect(event).toBeDefined();
  expect(JSON.stringify(event).includes(marker)).toBe(false);
  expect(event).not.toHaveProperty('request');
  expect(event).not.toHaveProperty('user');
  expect(event).not.toHaveProperty('breadcrumbs');
  expect(event?.tags).toMatchObject({ service: 'game-feedback', layer: 'browser' });

  const directory = resolve(import.meta.dirname, '../../../../.data');
  await mkdir(directory, { recursive: true });
  const report = {
    service: 'game-feedback',
    checkedAt: new Date().toISOString(),
    sentry: {
      status: sentryResponse.status(),
      eventId: event?.event_id,
      environment: event?.environment,
      release: event?.release,
    },
    amplitude: {
      status: accepted.code,
      eventsIngested: accepted.events_ingested,
      eventTypes: batch.events?.map((item) => item.event_type),
      serverUploadTime: accepted.server_upload_time,
    },
  };
  await writeFile(
    resolve(directory, 'monitoring-web-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
});
