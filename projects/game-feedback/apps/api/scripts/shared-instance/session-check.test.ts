import { describe, expect, it, vi } from 'vitest';

import { assertAnonymousSession } from './session-check.mjs';

function response(status: number, body: object, retryAfter = '1') {
  return {
    status,
    headers: { 'retry-after': retryAfter },
    text: () => JSON.stringify(body),
    json: () => body,
  };
}

describe('공유 배포 세션 격리 검사', () => {
  it('정상 응답의 user가 실제 null이어야 한다', async () => {
    await expect(assertAnonymousSession(async () => response(200, { user: null }))).resolves.toBeUndefined();
    await expect(assertAnonymousSession(async () => response(200, {}))).rejects.toThrow();
  });

  it('429 뒤에는 서버가 지정한 시간만 한 번 기다리고 다시 검사한다', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(response(429, { errorCode: 'RATE_LIMITED' }, '60'))
      .mockResolvedValueOnce(response(200, { user: null }));
    const wait = vi.fn().mockResolvedValue(undefined);
    await assertAnonymousSession(read, wait);
    expect(wait).toHaveBeenCalledExactlyOnceWith(60000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('서버 오류나 반복된 제한은 원래 응답과 함께 실패해야 한다', async () => {
    await expect(
      assertAnonymousSession(async () => response(503, { errorCode: 'UNAVAILABLE' })),
    ).rejects.toThrow('UNAVAILABLE');
    await expect(
      assertAnonymousSession(
        async () => response(429, { errorCode: 'RATE_LIMITED' }),
        async () => undefined,
      ),
    ).rejects.toThrow('RATE_LIMITED');
    await expect(assertAnonymousSession(async () => response(429, {}, '999'))).rejects.toThrow(
      'bounded Retry-After',
    );
  });
});
