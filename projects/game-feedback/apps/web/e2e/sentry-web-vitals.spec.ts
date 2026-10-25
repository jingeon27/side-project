import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { uniq } from 'es-toolkit';

interface ISpan {
  trace_id: string;
  attributes: Record<string, { value: unknown }>;
}

test('실제 브라우저의 LCP·CLS·INP와 보조 지표가 개인정보 없이 전송돼야 한다', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const spans: ISpan[] = [];
  const envelopes: string[] = [];
  const marker = 'web-vitals-private-canary';
  await context.addCookies([{ name: 'private-cookie', value: marker, url: baseURL ?? '' }]);
  const statuses: number[] = [];
  context.on('response', (response) => {
    const host = new URL(response.url()).hostname;
    if (!(host === 'sentry.invalid' || host.endsWith('.sentry.io')) || response.request().method() !== 'POST')
      return;
    const body = response.request().postData() ?? '';
    envelopes.push(body);
    statuses.push(response.status());
    for (const line of body.split('\n')) {
      try {
        const parsed = JSON.parse(line) as { items?: ISpan[] };
        if (Array.isArray(parsed.items)) spans.push(...parsed.items);
      } catch {
        /* Sentry envelope의 헤더와 각 payload는 별도 JSON 줄이다. */
      }
    }
  });
  await context.route('https://sentry.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await context.route('https://*.amplitude.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"code":200}' }),
  );
  await page.goto('/ko/privacy?q=' + marker);
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length))
    .toBeGreaterThan(0);
  await page.evaluate((canary) => {
    const button = document.createElement('button');
    button.id = canary;
    button.textContent = 'Web Vitals 확인';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:999999';
    button.onclick = () => {
      const start = performance.now();
      while (performance.now() - start < 80) {
        /* 실제 Event Timing을 만들기 위한 한 번의 지연이다. */
      }
      button.textContent = '측정 완료';
    };
    document.body.append(button);
  }, marker);
  await page.getByRole('button', { name: 'Web Vitals 확인', exact: true }).click();
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  // 페이지를 닫기 직전의 lifecycle을 전달하되 지표 값은 실제 PerformanceObserver가 계산한다.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  for (const metric of ['lcp', 'cls', 'inp', 'fcp', 'ttfb']) {
    const key = 'browser.web_vital.' + metric + '.value';
    await expect
      .poll(() => spans.some((span) => typeof span.attributes[key]?.value === 'number'), { timeout: 15000 })
      .toBe(true);
  }
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every((status) => status >= 200 && status < 300)).toBe(true);
  expect(envelopes.join('\n')).not.toContain(marker);
  for (const span of spans) {
    expect(span.attributes['service']?.value).toBe('game-feedback');
    expect(span.attributes['layer']?.value).toBe('browser');
    expect(span.attributes).not.toHaveProperty('url.full');
    expect(span.attributes).not.toHaveProperty('browser.web_vital.lcp.url');
    expect(span.attributes).not.toHaveProperty('browser.web_vital.inp.target');
  }
  const receipt = testInfo.outputPath('web-vitals-receipt.json');
  await writeFile(
    receipt,
    JSON.stringify(
      {
        service: 'game-feedback',
        traceIds: uniq(spans.map((span) => span.trace_id)),
        statuses,
        metrics: Object.fromEntries(
          ['lcp', 'cls', 'inp', 'fcp', 'ttfb'].map((metric) => {
            const key = 'browser.web_vital.' + metric + '.value';
            return [metric, spans.find((span) => span.attributes[key])?.attributes[key]?.value];
          }),
        ),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await testInfo.attach('web-vitals-receipt', { path: receipt, contentType: 'application/json' });
});
