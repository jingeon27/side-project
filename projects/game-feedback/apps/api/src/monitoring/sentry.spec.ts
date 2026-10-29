import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initSentry, reportableError, reportUnexpectedError, scrubEvent, sentryOptions } from './sentry';

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
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('SENTRY_RELEASE', 'test-release');
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
    expect(captured[0]).toContain('"environment":"test"');
    expect(captured[0]).toContain('"release":"test-release"');
  });

  it('실제 span 전송에서 작업명·측정값만 남기고 SQL·사용자·URL·링크를 제거해야 한다', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@example.invalid/1');
    const captured: string[] = [];
    Sentry.init({
      ...sentryOptions(),
      tracesSampleRate: 1,
      transport: () => ({
        send: async (envelope) => {
          captured.push(JSON.stringify(envelope));
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    await Sentry.startSpan(
      {
        name: 'POST /api/conversations/private-conversation-id/messages?token=private-token',
        op: 'http.server',
        parentSpan: null,
        attributes: {
          'http.route': '/api/conversations/:id/messages',
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': 'https://example.com/private-url',
          'user.id': 'private-user-id',
          'http.request.header.cookie': 'private-cookie',
        },
      },
      async () => {
        await Sentry.startSpan(
          {
            name: 'chat.persist',
            op: 'db.transaction',
            attributes: { 'db.statement': 'SELECT private-sql-value', 'message.body': 'private-body' },
          },
          async () => {},
        );
        await Sentry.startSpan(
          {
            name: 'chat.publish',
            op: 'messaging.publish',
            attributes: {
              'chat.publish.sent': 2,
              'chat.publish.failed': 0,
              'chat.publish.recipients': 'private-invalid-number',
              'sentry.segment.name': 'private-parent-name',
            },
            links: [
              {
                context: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 },
                attributes: { private: 'private-link' },
              },
            ],
          },
          async () => {},
        );
      },
    );
    Sentry.startSpan({ name: 'private-unknown-operation', op: 'db.sql', parentSpan: null }, () => {});
    await Sentry.flush(1000);
    const payload = captured.join('\n');
    expect(payload).not.toContain('private-');
    expect(payload).not.toContain('db.statement');
    expect(payload).toContain('POST /api/conversations/:id/messages');
    expect(payload).toContain('chat.persist');
    expect(payload).toContain('chat.publish');
    expect(payload).toContain('chat.publish.sent');
    expect(payload).not.toContain('chat.publish.recipients');
    expect(payload).toContain('api.operation');
  });
});
