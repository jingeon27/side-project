import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkSentry } from './check-sentry';

type TAfterSend = (event: { event_id?: string }, response: { statusCode?: number }) => void;

function fixture(status: number | undefined = 200, responseEventId = 'verification-event') {
  const state: { afterSend?: TAfterSend } = {};
  const sdk = {
    init: vi.fn(),
    getClient: () => ({
      on: (_hook: 'afterSendEvent', callback: TAfterSend) => {
        state.afterSend = callback;
      },
    }),
    lastEventId: () => 'verification-event',
    flush: vi.fn(async () => {
      state.afterSend?.({ event_id: responseEventId }, { statusCode: status });
      return true;
    }),
    close: vi.fn(async () => true),
  };
  return {
    sdk,
    options: { dsn: 'https://public-key@sentry.example/123', environment: 'test' },
    report: vi.fn(),
    service: 'example-api',
  };
}

afterEach(() => vi.restoreAllMocks());

describe('서비스 Sentry 설정 검사', () => {
  it('서비스의 오류 보고 경로로 보낸 이벤트의 성공 응답을 확인해야 한다', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const check = fixture();
    await checkSentry(check);
    expect(check.sdk.init).toHaveBeenCalledWith(check.options);
    expect(check.report).toHaveBeenCalledWith(expect.any(Error), {
      verification: 'configuration-check',
      service: 'example-api',
    });
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual({
      service: 'example-api',
      eventId: 'verification-event',
      status: 200,
      environment: 'test',
    });
    expect(check.sdk.close).toHaveBeenCalledWith(1000);
  });

  it.each([
    '',
    'https://sentry.example/123',
    'https://key@sentry.example/project',
    'ftp://key@sentry.example/123',
  ])('잘못된 DSN %s로는 SDK를 초기화하거나 전송하지 않아야 한다', async (dsn) => {
    const check = fixture();
    await expect(checkSentry({ ...check, options: { dsn } })).rejects.toThrow('SENTRY_DSN');
    expect(check.sdk.init).not.toHaveBeenCalled();
    expect(check.report).not.toHaveBeenCalled();
  });

  it.each([0, 429, 500])('수집 응답이 %s이면 실패하고 SDK를 닫아야 한다', async (status) => {
    const check = fixture(status);
    await expect(checkSentry(check)).rejects.toThrow('수집 확인 실패');
    expect(check.sdk.close).toHaveBeenCalledWith(1000);
  });

  it('다른 이벤트의 성공 응답으로 검사 성공을 판단하지 않아야 한다', async () => {
    const check = fixture(200, 'unrelated-event');
    await expect(checkSentry(check)).rejects.toThrow('응답 없음');
    expect(check.sdk.close).toHaveBeenCalledWith(1000);
  });

  it('전송 중 예외가 나도 SDK를 닫아야 한다', async () => {
    const check = fixture();
    check.sdk.flush.mockRejectedValue(new Error('transport failed'));
    await expect(checkSentry(check)).rejects.toThrow('transport failed');
    expect(check.sdk.close).toHaveBeenCalledWith(1000);
  });
});
