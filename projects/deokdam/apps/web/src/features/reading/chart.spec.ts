import { describe, expect, it } from 'vitest';

import { calculateChart } from './chart';

describe('Korean birth chart', () => {
  const today = '2026-11-27';
  const solar = { calendar: 'solar', leapMonth: false, time: '' } as const;

  it('uses the Korean leap lunar month and matches its corresponding solar day', () => {
    const lunar = calculateChart({ calendar: 'lunar', date: '20230201', leapMonth: true, time: '' }, today);
    expect(lunar).toEqual(calculateChart({ ...solar, date: '2023-03-22' }, today));
    expect(lunar).toMatchObject({ year: '계묘', month: '을묘', day: '기묘', time: null, element: 'earth' });
    expect(() =>
      calculateChart({ calendar: 'lunar', date: '20230401', leapMonth: true, time: '' }, today),
    ).toThrow();
  });

  it('changes year and month at the Korean 입춘 instant and leaves them unknown without a time', () => {
    // KASI's 2024 calendar places 입춘 at 17:27 KST.
    expect(calculateChart({ ...solar, date: '2024-02-04', time: '17:20' }, today)).toMatchObject({
      year: '계묘',
      month: '을축',
      time: '신유',
    });
    expect(calculateChart({ ...solar, date: '2024-02-04', time: '17:35' }, today)).toMatchObject({
      year: '갑진',
      month: '병인',
    });
    expect(calculateChart({ ...solar, date: '2024-02-04' }, today)).toMatchObject({
      year: null,
      month: null,
      time: null,
    });
  });

  it('rejects impossible or future dates and computes adult eligibility from the solar birthday', () => {
    expect(() => calculateChart({ ...solar, date: '2021-02-29' }, today)).toThrow();
    expect(() => calculateChart({ ...solar, date: '2026-11-28' }, today)).toThrow();
    expect(calculateChart({ ...solar, date: '2007-11-27' }, today).adult).toBe(true);
    expect(calculateChart({ ...solar, date: '2007-11-28' }, today).adult).toBe(false);
  });
});
