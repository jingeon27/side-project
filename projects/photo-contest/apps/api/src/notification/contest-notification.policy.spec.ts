import { describe, expect, it } from 'vitest';

import { notificationRetryDelayMs } from './contest-notification.policy';

const MINUTE_MS = 60_000;

describe('notificationRetryDelayMs', () => {
  it('실패할 때마다 1분부터 두 배씩 늦춰야 한다', () => {
    expect([1, 2, 3, 4].map(notificationRetryDelayMs)).toEqual([1, 2, 4, 8].map((n) => n * MINUTE_MS));
  });

  it('아무리 많이 실패해도 1시간을 넘기지 않아야 한다', () => {
    expect(notificationRetryDelayMs(7)).toBe(60 * MINUTE_MS);
    expect(notificationRetryDelayMs(10_000)).toBe(60 * MINUTE_MS);
  });

  it('잘못된 횟수는 첫 실패로 봐야 한다', () => {
    expect(notificationRetryDelayMs(0)).toBe(MINUTE_MS);
    expect(notificationRetryDelayMs(-3)).toBe(MINUTE_MS);
  });
});
