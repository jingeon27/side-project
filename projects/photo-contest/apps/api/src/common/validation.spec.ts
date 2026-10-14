import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import { pageRange, textValue } from './validation';

function errorOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof GraphQLError) return { message: error.message, code: error.extensions.code };
    throw error;
  }
  throw new Error('예외가 나지 않았습니다.');
}

describe('입력 검증', () => {
  it('앞뒤 공백을 지운 1~max자 문자열만 받아야 한다', () => {
    expect(textValue('  친구들  ', 40, '이름')).toBe('친구들');
    expect(textValue('a'.repeat(40), 40, '이름')).toBe('a'.repeat(40));
    expect(errorOf(() => textValue('   ', 40, '그룹 이름'))).toEqual({
      message: '그룹 이름은(는) 1~40자여야 합니다.',
      code: 'BAD_USER_INPUT',
    });
    expect(() => textValue('a'.repeat(41), 40, '이름')).toThrow(GraphQLError);
  });

  it('문자열이 아닌 값은 거부해야 한다', () => {
    expect(() => textValue(undefined, 24, '닉네임')).toThrow('닉네임은(는) 1~24자여야 합니다.');
    expect(() => textValue(123, 24, '닉네임')).toThrow(GraphQLError);
    expect(() => textValue({ toString: () => '이름' }, 24, '닉네임')).toThrow(GraphQLError);
  });

  it('목록 범위는 offset 0 이상 정수, limit 1~48 정수만 받아야 한다', () => {
    expect(pageRange(0, 1)).toEqual({ offset: 0, limit: 1 });
    expect(pageRange(96, 48)).toEqual({ offset: 96, limit: 48 });
    for (const [offset, limit] of [
      [-1, 24],
      [0, 0],
      [0, 49],
      [1.5, 24],
      [0, 2.5],
      ['0', 24],
      [0, null],
    ])
      expect(errorOf(() => pageRange(offset, limit))).toEqual({
        message: '올바른 목록 범위를 지정해 주세요.',
        code: 'BAD_USER_INPUT',
      });
  });
});
