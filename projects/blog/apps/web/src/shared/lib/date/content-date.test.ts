import { expect, it } from 'vitest';

import { parseContentDate } from './content-date';

it('reads a date-only value as midnight in Asia/Seoul and keeps offset datetimes as written', () => {
  expect(parseContentDate('2026-10-01')).toBe(Date.parse('2026-09-30T15:00:00Z'));
  expect(parseContentDate('2026-10-01T08:00:00+09:00')).toBe(Date.parse('2026-09-30T23:00:00Z'));
  expect(parseContentDate('2026-10-01T08:00:00+09:00')).toBeGreaterThan(parseContentDate('2026-10-01'));
});
