import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSentry, reportableError, reportUnexpectedError, sentryOptions, scrubEvent } from './sentry';
afterEach(async () => {
  await Sentry.close(1000);
  vi.unstubAllEnvs();
});
describe('API Sentry', () => {
  it('DSN이 없으면 초기화하지 않아야 한다', () => {
    vi.stubEnv('SENTRY_DSN', '');
    expect(sentryOptions()).toBeUndefined();
    expect(initSentry()).toBe(false);
  });
  it('Prisma 메시지와 SQL 인자를 제거하고 오류 종류와 호출 위치만 남겨야 한다', () => {
    const error = new TypeError('password-private-value');
    error.stack =
      'TypeError: password-private-value\nSELECT private-query\n    at write (/app/service.ts:10:2)';
    const result = reportableError(error);
    expect(result.message).toBe('Unexpected TypeError');
    expect(result.stack).toContain('at write');
    expect(JSON.stringify({ message: result.message, stack: result.stack })).not.toContain('private');
  });
  it('이벤트의 요청·사용자·입력 기록을 제거해야 한다', () => {
    const event = scrubEvent({
      request: { url: 'https://example.com/private' },
      user: { id: 'private' },
      breadcrumbs: [{ message: 'private' }],
    });
    expect(JSON.stringify(event)).not.toContain('private');
  });
  it('실제 SDK의 격리 전송에서도 비공개 메시지 없이 오류와 라우트 패턴만 보내야 한다', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@example.invalid/1');
    const captured: string[] = [];
    Sentry.init({
      ...sentryOptions(),
      transport: () => ({
        send: async (envelope) => {
          captured.push(JSON.stringify(envelope));
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    reportUnexpectedError(new Error('private-query-and-cookie'), {
      method: 'POST',
      route: '/api/conversations/:id/messages',
    });
    await Sentry.flush(1000);
    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toContain('private-query-and-cookie');
    expect(captured[0]).toContain('/api/conversations/:id/messages');
  });
});
