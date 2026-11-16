import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from '../common/http/api-error';
import { measureChatOperation, recordChatHttp, recordChatSend, scrubChatMetric } from './chat-metrics';
import { sentryOptions } from './sentry';

const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])),
]);
const metricSchema = z.object({
  name: z.string(),
  type: z.string(),
  value: z.number().finite(),
  unit: z.string().optional(),
  trace_id: z.string(),
  attributes: z.record(z.string(), z.object({ type: z.string(), value: z.unknown() })),
});

function setup() {
  vi.stubEnv('SENTRY_DSN', 'https://test@sentry.invalid/1');
  vi.stubEnv('ENVIRONMENT', 'test');
  vi.stubEnv('SENTRY_RELEASE', 'chat-metrics-test');
  const envelopes: string[] = [];
  Sentry.init({
    ...sentryOptions(),
    tracesSampleRate: 0,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  const captured = () =>
    envelopes.flatMap((raw) => {
      const [, items] = envelopeSchema.parse(JSON.parse(raw));
      return items.flatMap(([header, payload]) =>
        header.type === 'trace_metric' ? z.object({ items: z.array(metricSchema) }).parse(payload).items : [],
      );
    });
  return { envelopes, captured };
}

afterEach(async () => {
  await Sentry.close(1000);
  vi.unstubAllEnvs();
});

describe('chat application metrics', () => {
  it('추적 샘플링이 0이어도 실제 작업의 분포와 HTTP 상태·전송 결과를 수집하고 scope 개인정보까지 제거한다', async () => {
    const { envelopes, captured } = setup();
    await Sentry.withScope(async (scope) => {
      scope.setUser({ id: 'private-user', email: 'private-email@example.invalid' });
      scope.setAttribute('private.scope', 'private-scope-value');
      scope.setAttribute('http.route', '/api/conversations/private-id/messages');
      const result = await measureChatOperation('chat.persist', async () => ({ saved: true }));
      expect(result).toEqual({ saved: true });
      recordChatSend('created');
      recordChatHttp('/api/conversations/:id/messages', 'POST', 200, 12, false);
      recordChatHttp('/api/conversations/:id/messages', 'POST', 409, 8, false);
      recordChatHttp('/api/conversations/:id/messages', 'POST', 503, 18, false);
      recordChatHttp('/api/conversations/:id/messages', 'POST', 200, 3, true);
      Sentry.metrics.count('private-metric-name', 1);
    });
    await Sentry.flush(1000);
    const samples = captured();
    expect(
      samples
        .filter((metric) => metric.name === 'chat.http.requests')
        .map((metric) => metric.attributes.outcome?.value),
    ).toEqual(['ok', 'client_error', 'server_error', 'aborted']);
    expect(
      samples
        .filter((metric) => metric.name === 'chat.http.duration')
        .map((metric) => [metric.value, metric.unit]),
    ).toEqual([
      [12, 'millisecond'],
      [8, 'millisecond'],
      [18, 'millisecond'],
      [3, 'millisecond'],
    ]);
    expect(samples.find((metric) => metric.name === 'chat.operation.duration')).toMatchObject({
      value: expect.any(Number),
      unit: 'millisecond',
      attributes: { operation: { value: 'chat.persist' } },
    });
    expect(samples.find((metric) => metric.name === 'chat.send.results')).toMatchObject({
      value: 1,
      attributes: { result: { value: 'created' } },
    });
    for (const metric of samples) {
      expect(metric.value).toBeGreaterThanOrEqual(0);
      expect(metric.attributes.service?.value).toBe('game-feedback');
      expect(metric.attributes.layer?.value).toBe('api');
      expect(metric.attributes['sentry.environment']?.value).toBe('test');
      expect(metric.attributes['sentry.release']?.value).toBe('chat-metrics-test');
    }
    expect(envelopes.join('\n')).not.toContain('private');
    expect(envelopes.join('\n')).not.toContain('server.address');
    expect(envelopes.join('\n')).not.toContain('"type":"span"');
  });

  it('업무상 거절과 내부 실패를 구분하면서 원래 오류 객체와 작업 지연을 보존한다', async () => {
    const { captured } = setup();
    const conflict = new ApiError(409, 'MESSAGE_CONFLICT', 'private-request');
    const failure = new Error('private-db-query');
    await expect(
      measureChatOperation('chat.persist', async () => {
        throw conflict;
      }),
    ).rejects.toBe(conflict);
    await expect(
      measureChatOperation('chat.persist', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await Sentry.flush(1000);
    const samples = captured();
    expect(
      samples
        .filter((metric) => metric.name === 'chat.operation.failures')
        .map((metric) => metric.attributes.outcome?.value),
    ).toEqual(['rejected', 'failed']);
    expect(samples.filter((metric) => metric.name === 'chat.operation.duration')).toHaveLength(2);
    expect(JSON.stringify(samples)).not.toContain('private');
  });

  it('알 수 없는 이름·타입·무한값·음수는 전송하지 않는다', () => {
    expect(scrubChatMetric({ name: 'private-name', type: 'counter', value: 1 })).toBeNull();
    expect(scrubChatMetric({ name: 'chat.http.requests', type: 'gauge', value: 1 })).toBeNull();
    expect(scrubChatMetric({ name: 'chat.http.duration', type: 'distribution', value: Infinity })).toBeNull();
    expect(scrubChatMetric({ name: 'chat.sse.active', type: 'gauge', value: -1 })).toBeNull();
  });
});
