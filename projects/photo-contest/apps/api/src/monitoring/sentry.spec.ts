import { captureException, init, type ErrorEvent } from '@sentry/node';
import { GraphQLError } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initSentry, reportableError, reportUnexpectedError, scrubEvent, sentryOptions } from './sentry';

vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn() }));

class FakePrismaError extends Error {
  code = 'P2002';
  override name = 'PrismaClientKnownRequestError';
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Sentry 초기화', () => {
  it('SENTRY_DSN이 없으면 초기화하지 않아야 한다', () => {
    vi.stubEnv('SENTRY_DSN', '');
    expect(sentryOptions()).toBeUndefined();
    expect(initSentry()).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('DSN이 있으면 개인정보 없이 환경·릴리스·추적 비율을 설정해야 한다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@sentry.example/1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(initSentry()).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@sentry.example/1',
        environment: 'production',
        tracesSampleRate: 0,
        sendDefaultPii: false,
        defaultIntegrations: false,
        beforeSend: scrubEvent,
        beforeSendTransaction: scrubEvent,
      }),
    );
  });

  it('추적 비율이 없거나 0~1 사이 숫자가 아니면 0이어야 한다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@sentry.example/1');
    for (const invalid of ['', 'abc', '-0.1', '1.5', 'Infinity']) {
      expect(sentryOptions()?.tracesSampleRate, invalid).toBe(0);
    }
    expect(sentryOptions()?.tracesSampleRate).toBe(0);
  });
});

describe('Sentry 이벤트 정리', () => {
  it('보내기 전에 요청(쿠키·본문)·사용자·breadcrumb를 지워야 한다', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'boom',
      tags: { route: 'GET /photos/:id' },
      request: {
        url: 'https://api.example/uploads/secret-token',
        cookies: { contest_session: 'session-secret' },
        data: '{"nickname":"홍길동"}',
        headers: { cookie: 'contest_session=session-secret' },
      },
      user: { id: 'user-1', ip_address: '10.0.0.1' },
      breadcrumbs: [{ message: 'POST /auth/dev {"nickname":"홍길동"}' }],
    };
    const scrubbed = scrubEvent(event);
    expect(scrubbed).toEqual({ type: undefined, message: 'boom', tags: { route: 'GET /photos/:id' } });
    expect(JSON.stringify(scrubbed)).not.toMatch(/session-secret|홍길동|secret-token/);
  });

  it('보고할 오류에는 원본 메시지 대신 종류·코드·호출 위치만 남겨야 한다', () => {
    const original = new FakePrismaError('Invalid `prisma.user.create()` invocation: nickname "홍길동"');
    const reported = reportableError(new GraphQLError('wrapped', { originalError: original }));
    expect(reported.message).toBe('Unexpected PrismaClientKnownRequestError P2002');
    expect(reported.stack).not.toContain('홍길동');
    expect(reported.stack).toContain('sentry.spec.ts');
    expect(reportableError('문자열 오류').message).toBe('Unexpected string');
    expect(
      reportableError(new GraphQLError('설정 없음', { extensions: { code: 'UNAVAILABLE' } })).message,
    ).toBe('Unexpected GraphQLError UNAVAILABLE');
  });

  it('예상하지 못한 오류는 정리한 오류와 태그만 보내야 한다', () => {
    reportUnexpectedError(new Error('세션 contest_session=session-secret'), { route: 'POST /auth/dev' });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(captureException).mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Unexpected Error');
    expect(context).toEqual({ tags: { route: 'POST /auth/dev' } });
    expect(`${(error as Error).stack}`).not.toContain('session-secret');
  });
});
