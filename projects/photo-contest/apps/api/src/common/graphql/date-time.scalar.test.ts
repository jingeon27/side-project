import dayjs from 'dayjs';
import { Kind } from 'graphql';
import { describe, expect, it } from 'vitest';

import { DateTimeScalar } from './date-time.scalar';

describe('DateTime의 외부 Date 계약', () => {
  const scalar = new DateTimeScalar();

  it.each([
    ['2026-10-31', '2026-10-31T00:00:00.000Z'],
    ['2026-10-31T09:15:00+09:00', '2026-10-31T00:15:00.000Z'],
    ['2024-02-29T23:59:59.123Z', '2024-02-29T23:59:59.123Z'],
  ])('%s를 같은 절대 시각의 Date로 전달해야 한다', (value, expected) => {
    const result = scalar.parseValue(value);
    expect(result).toBeInstanceOf(Date);
    expect(result).toEqual(dayjs(expected).toDate());
    expect(scalar.serialize(result)).toBe(expected);
    expect(scalar.parseLiteral({ kind: Kind.STRING, value })).toEqual(result);
  });

  it.each(['', 'not-a-date', '2026-13-01', '2026-10-31T25:00:00Z', 0, null])(
    '기존 파싱 경계가 거부하던 %j를 자동 보정하지 않아야 한다',
    (value) => expect(() => scalar.parseValue(value)).toThrow(),
  );
});
