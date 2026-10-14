import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatDate,
  formatDateTime,
  formatTimeLeft,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from './format.helper';

describe('format.helper', () => {
  it('서버 시각을 서비스 시간대(Asia/Seoul) 기준 한국어로 보여 줘야 한다', () => {
    expect(formatDateTime('2026-10-14T06:00:00.000Z')).toBe('10월 14일 (수) 오후 3:00');
    expect(formatDate('2026-10-13T16:30:00.000Z')).toBe('2026년 10월 14일');
  });

  it('수를 천 단위로 끊어야 한다', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('마감까지 남은 시간을 가장 큰 단위로 보여 주고 지났으면 null이어야 한다', () => {
    const now = new Date('2026-10-14T00:00:00.000Z');
    expect(formatTimeLeft('2026-10-16T05:00:00.000Z', now)).toBe('2일 남음');
    expect(formatTimeLeft('2026-10-14T05:30:00.000Z', now)).toBe('5시간 남음');
    expect(formatTimeLeft('2026-10-14T00:12:00.000Z', now)).toBe('12분 남음');
    expect(formatTimeLeft('2026-10-14T00:00:30.000Z', now)).toBe('곧 마감');
    expect(formatTimeLeft('2026-10-13T23:59:00.000Z', now)).toBeNull();
  });

  it('datetime-local 값과 ISO 시각을 서로 바꿀 수 있어야 한다', () => {
    const value = toDateTimeLocalValue(new Date('2026-10-14T06:05:00.000Z'));
    expect(value).toBe('2026-10-14T15:05');
    expect(fromDateTimeLocalValue(value)).toBe('2026-10-14T06:05:00.000Z');
    expect(fromDateTimeLocalValue('2026-10-14')).toBeNull();
  });
});
