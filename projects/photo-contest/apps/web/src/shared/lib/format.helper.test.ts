import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatDateTime } from './format.helper';

afterEach(() => vi.restoreAllMocks());

describe('한국어 날짜의 서버·WebKit 표시 일치', () => {
  it.each([
    ['2026-10-24T18:36:56.341Z', '10월 25일 (일) 오전 3:36'],
    ['2026-10-14T06:00:00.000Z', '10월 14일 (수) 오후 3:00'],
    ['2026-10-13T15:00:00.000Z', '10월 14일 (수) 오전 12:00'],
    ['2026-10-14T03:00:00.000Z', '10월 14일 (수) 오후 12:00'],
  ])('Intl이 영문 오전·오후를 반환해도 %s를 같은 한국어로 표시해야 한다', (iso, expected) => {
    const formatToParts = Intl.DateTimeFormat.prototype.formatToParts;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (
      this: Intl.DateTimeFormat,
      date,
    ) {
      // Linux WebKit은 ko-KR에서도 dayPeriod를 AM/PM으로 반환한다.
      return formatToParts.call(this, date).map((part) => ({
        ...part,
        value: part.value.replace('오전', 'AM').replace('오후', 'PM'),
      }));
    });
    expect(formatDateTime(iso)).toBe(expected);
  });
});
