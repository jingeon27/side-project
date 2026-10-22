import { describe, expect, it } from 'vitest';

import { FixedWindowCounter } from './graphql-rate-limit.middleware';

describe('FixedWindowCounter', () => {
  it('주소마다 첫 요청부터 창 길이 동안 세고 창이 끝나면 처음부터 세야 한다', () => {
    const counter = new FixedWindowCounter(60_000);
    const start = 1_800_000_000_000;
    expect(counter.hit('a', start)).toEqual({ count: 1, resetAt: start + 60_000 });
    expect(counter.hit('a', start + 59_999).count).toBe(2);
    expect(counter.hit('b', start + 30_000)).toEqual({ count: 1, resetAt: start + 90_000 });
    expect(counter.hit('a', start + 60_000)).toEqual({ count: 1, resetAt: start + 120_000 });
    expect(counter.hit('b', start + 60_001).count).toBe(2);
  });

  it('끝난 창의 주소는 다음 정리 때 잊어야 한다', () => {
    const counter = new FixedWindowCounter(60_000);
    const start = 1_800_000_000_000;
    for (let index = 0; index < 100; index++) counter.hit(`address-${index}`, start);
    expect(counter.size).toBe(100);
    counter.hit('late', start + 60_000);
    expect(counter.size).toBe(1);
  });
});
