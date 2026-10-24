import { describe, expect, it, vi } from 'vitest';

import { EXPO_PUSH_TOKEN_PATTERN, ExpoPushTransport, PushProviderError, type IPushMessage } from './index';

const message: IPushMessage = {
  to: 'ExpoPushToken[abcdefghijklmnop123456]',
  title: '서비스',
  body: '새 알림이 도착했어요.',
  data: { path: '/notifications', notificationId: 'n1' },
  badge: 1,
  sound: 'default',
  channelId: 'activity',
};
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('Expo push HTTP transport', () => {
  it('메시지 순서와 기기별 오류를 보존하고 설정한 서버 키만 전송해야 한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        data: [
          { status: 'ok', id: 'ticket-1' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
    const transport = new ExpoPushTransport({ fetch: fetcher, accessToken: 'test-server-key' });
    expect(await transport.send([message, message])).toEqual([
      { status: 'ok', id: 'ticket-1' },
      { status: 'error', code: 'DeviceNotRegistered' },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-server-key' }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(EXPO_PUSH_TOKEN_PATTERN.test(message.to)).toBe(true);
    expect(EXPO_PUSH_TOKEN_PATTERN.test('arbitrary-device-token')).toBe(false);
  });

  it('429·5xx만 재시도 대상으로 분류하고 오류에 서버 응답 원문을 노출하지 않아야 한다', async () => {
    for (const status of [400, 401, 429, 503]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ error: 'secret response' }, status, { 'retry-after': '9999' }));
      const failure = await new ExpoPushTransport({ fetch: fetcher })
        .send([message])
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PushProviderError);
      expect(failure).toMatchObject({
        status,
        retryable: status === 429 || status >= 500,
        retryAfterMs: 60_000,
      });
      expect(String(failure)).not.toContain('secret response');
    }
  });

  it('배치 크기와 응답 개수를 검증하고 네트워크 실패를 재시도할 수 있어야 한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [] }));
    const transport = new ExpoPushTransport({ fetch: fetcher });
    await expect(transport.send(Array.from({ length: 101 }, () => message))).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(transport.send([message])).rejects.toMatchObject({ status: 502, retryable: true });
    fetcher.mockRejectedValue(new Error('network unavailable'));
    await expect(transport.send([message])).rejects.toMatchObject({ status: 503, retryable: true });
  });

  it('준비된 영수증의 기기 오류를 반환하고 아직 없는 영수증은 남겨야 한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        data: { a: { status: 'ok' }, b: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
      }),
    );
    expect(await new ExpoPushTransport({ fetch: fetcher }).receipts(['a', 'b', 'c'])).toEqual({
      a: { status: 'ok' },
      b: { status: 'error', code: 'DeviceNotRegistered' },
    });
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });
});
