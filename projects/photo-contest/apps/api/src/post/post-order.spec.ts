import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { koreanMonth } from './post-order';

describe('그룹 기간', () => {
  it('UTC 월말이어도 한국의 다음 달을 계산해야 한다', () => {
    expect(koreanMonth(dayjs('2026-09-30T15:00:00Z').toDate())).toEqual({
      gte: dayjs('2026-09-30T15:00:00Z').toDate(),
      lt: dayjs('2026-10-31T15:00:00Z').toDate(),
    });
    expect(koreanMonth(dayjs('2026-12-31T15:00:00Z').toDate()).lt).toEqual(
      dayjs('2027-01-31T15:00:00Z').toDate(),
    );
  });

  it.each([
    ['2024-02-29T14:59:59.999Z', '2024-01-31T15:00:00.000Z', '2024-02-29T15:00:00.000Z'],
    ['2024-02-29T15:00:00.000Z', '2024-02-29T15:00:00.000Z', '2024-03-31T15:00:00.000Z'],
    ['2026-12-31T14:59:59.999Z', '2026-11-30T15:00:00.000Z', '2026-12-31T15:00:00.000Z'],
  ])('윤년·연말 경계 %s에서 KST의 반열린 월 범위를 유지해야 한다', (now, start, end) => {
    const range = koreanMonth(dayjs(now).toDate());
    expect(range.gte.toISOString()).toBe(start);
    expect(range.lt.toISOString()).toBe(end);
  });
});
