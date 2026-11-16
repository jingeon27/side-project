import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatTimeLeft,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from './format.helper';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

describe('dayjs 전환의 표시·기기 시간대 경계', () => {
  it('날짜 전용 값은 UTC 자정으로 읽고 서비스 시간대로 표시해야 한다', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(formatDate('2026-10-31')).toBe('2026년 10월 31일');
    expect(formatDateTime('2026-10-31')).toBe('10월 31일 (토) 오전 9:00');
  });

  it.each([
    ['2026-03-08T06:59:00Z', '2026-03-08T01:59'],
    ['2026-03-08T07:00:00Z', '2026-03-08T03:00'],
    ['2026-11-01T05:30:00Z', '2026-11-01T01:30'],
    ['2026-11-01T06:30:00Z', '2026-11-01T01:30'],
  ])('DST 전후 %s를 기기 현지 입력값으로 표시해야 한다', (iso, expected) => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(toDateTimeLocalValue(dayjs(iso).toDate())).toBe(expected);
  });

  it('기존 로컬 입력의 DST 해석과 경과 시간을 보존해야 한다', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(fromDateTimeLocalValue('2026-03-08T02:30')).toBe('2026-03-08T07:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-11-01T01:30')).toBe('2026-11-01T05:30:00.000Z');
    expect(formatTimeLeft('2026-03-09T06:30:00Z', dayjs('2026-03-08T06:30:00Z').toDate())).toBe('1일 남음');
  });

  it.each(['2026-13-01T12:00', '2026-10-31T25:00', '2026-10-31', 'not-a-date'])(
    '잘못된 로컬 입력 %s를 자동 보정하지 않아야 한다',
    (value) => expect(fromDateTimeLocalValue(value)).toBeNull(),
  );
});
