import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

import { ConversationSchema, SessionSchema } from '@game-feedback/contracts';

import { boundedSetting, percentiles, RequestMeasurement, type IRequestWindow } from './measurement';

const origin = 'http://127.0.0.1:3301';
const baselineMs = 31_000;
const samples = boundedSetting('GF_CHAT_BENCHMARK_SAMPLES', 5, 1, 20);
const intervalMs = boundedSetting('GF_CHAT_BENCHMARK_INTERVAL_MS', 5_000, 5_000, 15_000);
const sentInput = z.object({ clientMessageId: z.uuid(), body: z.string() });

interface ISample {
  sample: number;
  deliveryMs: number;
  postResponseMs: number;
  receiverUntilVisible: IRequestWindow;
  receiverFollowUp: IRequestWindow;
  receiverActiveStreams: number;
}

async function participant(browser: Browser, contexts: BrowserContext[]) {
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
  contexts.push(context);
  const response = await context.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname: `측정_${randomUUID().slice(0, 12)}` },
  });
  if (!response.ok()) throw new Error('벤치마크 로그인에 실패했습니다.');
  const session = SessionSchema.parse(await response.json());
  if (!session.user) throw new Error('독립 테스트 계정이 필요합니다.');
  return { context, userId: session.user.id };
}

async function openRealtime(page: Page, conversationId: string) {
  const stream = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/chat/events' && response.status() === 200,
  );
  await page.goto(`/ko/messages/${conversationId}`);
  if (!(await stream).headers()['content-type']?.startsWith('text/event-stream'))
    throw new Error('실제 SSE 연결이 필요합니다.');
  await expect(page.getByRole('textbox', { name: '메시지 내용', exact: true })).toBeVisible();
  await expect(page.locator('.chat-connection')).toHaveCount(0);
  if (!(await page.evaluate(() => document.visibilityState === 'visible')))
    throw new Error('두 브라우저 화면이 모두 활성 상태여야 합니다.');
}

async function sendSample(
  sender: Page,
  receiver: Page,
  conversationId: string,
  measurement: RequestMeasurement,
  clientMessageIds: Set<string>,
  sample: number,
): Promise<ISample> {
  const body = `benchmark-${randomUUID()}`;
  const input = sender.getByRole('textbox', { name: '메시지 내용', exact: true });
  const send = sender.getByRole('button', { name: '보내기', exact: true });
  await input.fill(body);
  await expect(send).toBeEnabled();
  measurement.assertHealthy();
  const response = sender.waitForResponse(
    (item) =>
      item.request().method() === 'POST' &&
      new URL(item.url()).pathname === `/api/conversations/${conversationId}/messages`,
  );
  // The filled input and SSE readiness are excluded. All durations use this Node process's monotonic clock.
  const startedAt = performance.now();
  const [, post, visibleAt] = await Promise.all([
    send.click(),
    response,
    (async () => {
      await receiver
        .getByRole('log')
        .getByText(body, { exact: true })
        .waitFor({ state: 'visible', timeout: 15_000 });
      return performance.now();
    })(),
  ]);
  if (!post.ok() || (await post.finished())) throw new Error('메시지 전송에 실패했습니다.');
  const sent = sentInput.parse(post.request().postDataJSON());
  if (sent.body !== body || clientMessageIds.has(sent.clientMessageId))
    throw new Error('샘플마다 새로운 전송 식별자가 필요합니다.');
  clientMessageIds.add(sent.clientMessageId);
  const timing = post.request().timing();
  if (timing.requestStart < 0 || timing.responseEnd < timing.requestStart)
    throw new Error('완료한 POST의 브라우저 요청 시간이 필요합니다.');
  await expect(input).toHaveValue('');
  await expect(receiver.getByRole('log').getByText(body, { exact: true })).toHaveCount(1);
  await expect(
    sender
      .getByRole('log')
      .locator('.chat-message')
      .filter({ hasText: body })
      .getByText('읽음', { exact: true }),
  ).toBeVisible();
  // This deliberate observation/pacing window includes receipts, subsequent invalidations and periodic polling.
  await delay(intervalMs);
  const endedAt = performance.now();
  measurement.assertHealthy();
  return {
    sample,
    deliveryMs: visibleAt - startedAt,
    postResponseMs: timing.responseEnd - timing.requestStart,
    receiverUntilVisible: measurement.window(startedAt, visibleAt),
    receiverFollowUp: measurement.window(visibleAt, endedAt),
    receiverActiveStreams: measurement.activeStreams(),
  };
}

test('isolated REST + SSE chat delivery benchmark', async ({ browser, baseURL }, testInfo) => {
  const database = URL.parse(process.env.DATABASE_URL ?? '');
  if (
    baseURL !== origin ||
    database?.hostname !== '127.0.0.1' ||
    database.pathname !== '/game_feedback_test' ||
    !/^gf_test_web_[a-f0-9]{32}$/.test(database.searchParams.get('schema') ?? '')
  )
    throw new Error('소유한 loopback 브라우저 테스트 하네스만 측정할 수 있습니다.');
  const contexts: BrowserContext[] = [];
  const measurements: RequestMeasurement[] = [];
  const results: ISample[] = [];
  const baselines: { requests: IRequestWindow; activeStreamsBefore: number; activeStreamsAfter: number }[] =
    [];
  const completed = await (async () => {
    try {
      const sender = await participant(browser, contexts);
      const receiver = await participant(browser, contexts);
      if (sender.userId === receiver.userId) throw new Error('서로 다른 두 계정이 필요합니다.');
      const created = await sender.context.request.post('/api/conversations', {
        headers: { Origin: origin },
        data: { recipientId: receiver.userId },
      });
      if (!created.ok()) throw new Error('격리된 대화를 만들지 못했습니다.');
      const conversation = ConversationSchema.parse(await created.json());
      const senderPage = await sender.context.newPage();
      const receiverPage = await receiver.context.newPage();
      const senderMeasurement = new RequestMeasurement(senderPage, origin);
      const receiverMeasurement = new RequestMeasurement(receiverPage, origin);
      measurements.push(senderMeasurement, receiverMeasurement);
      await openRealtime(senderPage, conversation.id);
      await openRealtime(receiverPage, conversation.id);
      const keys = new Set<string>();
      // Prime the visible-read and message-query paths once; exclude it from all distributions and baseline counts.
      await sendSample(senderPage, receiverPage, conversation.id, receiverMeasurement, keys, 0);
      receiverMeasurement.assertHealthy();
      const activeStreamsBefore = receiverMeasurement.activeStreams();
      const idleStart = performance.now();
      await delay(baselineMs);
      receiverMeasurement.assertHealthy();
      baselines.push({
        requests: receiverMeasurement.window(idleStart, performance.now()),
        activeStreamsBefore,
        activeStreamsAfter: receiverMeasurement.activeStreams(),
      });
      for (const index of Array.from({ length: samples }, (_, index) => index + 1)) {
        senderMeasurement.assertHealthy();
        results.push(
          await sendSample(senderPage, receiverPage, conversation.id, receiverMeasurement, keys, index),
        );
      }
      senderMeasurement.assertHealthy();
      return true;
    } catch {
      // Raw Playwright errors may contain message text, locators, cookies or URL identifiers.
      return false;
    } finally {
      for (const measurement of measurements) measurement.dispose();
      await Promise.allSettled(contexts.map((context) => context.close()));
    }
  })();
  await testInfo.attach('chat-delivery.json', {
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify(
        {
          schemaVersion: 1,
          status: completed ? 'complete' : 'incomplete',
          environment: 'isolated-loopback-production-web',
          settings: { requestedSamples: samples, intervalMs, baselineMs, warmupMessages: 1 },
          receiverBaseline: baselines[0] ?? null,
          samples: results,
          summary: {
            deliveryMs: percentiles(results.map((item) => item.deliveryMs)),
            postResponseMs: percentiles(results.map((item) => item.postResponseMs)),
          },
        },
        null,
        2,
      ),
    ),
  });
  if (!completed)
    throw new Error(
      '채팅 전달 벤치마크를 완료하지 못했습니다. 비식별 JSON의 완료 샘플과 연결 상태를 확인해주세요.',
    );
});
