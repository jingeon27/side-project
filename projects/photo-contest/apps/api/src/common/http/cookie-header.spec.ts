import { describe, expect, it } from 'vitest';

import { COOKIE_HEADER_MAX_LENGTH } from '../../config/limits';
import { readCookie } from './cookie-header';

const NAME = 'contest_session';

describe('Cookie 헤더 파서', () => {
  it('다른 쿠키와 섞여 있어도 이름이 정확히 같은 값만 읽어야 한다', () => {
    expect(readCookie('theme=dark; contest_session=abc; other=1', NAME)).toBe('abc');
    expect(readCookie('xcontest_session=nope; contest_session_x=nope', NAME)).toBeUndefined();
    expect(readCookie('Contest_Session=nope', NAME)).toBeUndefined();
  });

  it('세미콜론 주변 공백·탭과 빈 항목을 건너뛰어야 한다', () => {
    expect(readCookie(';;  \tcontest_session = abc \t;  ;', NAME)).toBe('abc');
    expect(readCookie('broken; =empty-name; contest_session=abc', NAME)).toBe('abc');
  });

  it('같은 이름이 여러 번 오면 첫 값만 써야 한다', () => {
    expect(readCookie('contest_session=first; contest_session=second', NAME)).toBe('first');
    expect(readCookie('contest_session=%E0%A4%A; contest_session=second', NAME)).toBeUndefined();
    expect(readCookie('contest_session=; contest_session=second', NAME)).toBeUndefined();
  });

  it('값이 없는 이름만 있는 항목은 쿠키로 보지 않아야 한다', () => {
    expect(readCookie('contest_session; contest_session=abc', NAME)).toBe('abc');
    expect(readCookie('contest_session', NAME)).toBeUndefined();
  });

  it('큰따옴표와 퍼센트 인코딩을 풀어야 한다', () => {
    expect(readCookie('contest_session="abc"', NAME)).toBe('abc');
    expect(readCookie('contest_session=a%2Db%5Fc', NAME)).toBe('a-b_c');
    expect(readCookie('contest_session="a%2Db"', NAME)).toBe('a-b');
  });

  it('형식이 깨진 값은 읽지 않아야 한다', () => {
    expect(readCookie('contest_session="abc', NAME)).toBeUndefined();
    expect(readCookie('contest_session="', NAME)).toBeUndefined();
    expect(readCookie('contest_session=a"b', NAME)).toBeUndefined();
    expect(readCookie('contest_session=a b', NAME)).toBeUndefined();
    expect(readCookie('contest_session=a\\b', NAME)).toBeUndefined();
    expect(readCookie('contest_session=%ZZ', NAME)).toBeUndefined();
    expect(readCookie('contest_session=a\u0001b', NAME)).toBeUndefined();
  });

  it('헤더가 없거나 상한을 넘으면 아무 쿠키도 읽지 않아야 한다', () => {
    expect(readCookie(undefined, NAME)).toBeUndefined();
    expect(readCookie('', NAME)).toBeUndefined();
    const prefix = 'contest_session=abc; pad=';
    const limit = prefix + 'x'.repeat(COOKIE_HEADER_MAX_LENGTH - prefix.length);
    expect(readCookie(limit, NAME)).toBe('abc');
    expect(readCookie(`${limit}x`, NAME)).toBeUndefined();
  });
});
