import { describe, expect, it } from 'vitest';

import { koreanMonth } from './post-order';

describe('그룹 기간', () => {
  it('UTC 월말이어도 한국의 다음 달을 계산해야 한다', () => {
    expect(koreanMonth(new Date('2026-09-30T15:00:00Z'))).toEqual({
      gte: new Date('2026-09-30T15:00:00Z'),
      lt: new Date('2026-10-31T15:00:00Z'),
    });
    expect(koreanMonth(new Date('2026-12-31T15:00:00Z')).lt).toEqual(new Date('2027-01-31T15:00:00Z'));
  });
});
