import { buildSchema, graphql, GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import { DomainError, ERROR_CODE, fail, httpStatusOf } from './errors';

describe('오류 code와 HTTP 상태', () => {
  it('오류 code마다 정해진 HTTP 상태로 바꿔야 한다', () => {
    expect(Object.fromEntries(Object.values(ERROR_CODE).map((code) => [code, httpStatusOf(code)]))).toEqual({
      BAD_USER_INPUT: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      UNAVAILABLE: 503,
      INTERNAL_SERVER_ERROR: 500,
    });
  });

  it('우리가 정하지 않은 code나 code가 없으면 400이어야 한다', () => {
    for (const code of [undefined, null, 42, 'GRAPHQL_VALIDATION_FAILED', 'toString', '__proto__'])
      expect(httpStatusOf(code), String(code)).toBe(400);
  });

  it('fail()은 기본으로 BAD_USER_INPUT GraphQL 오류를 던져야 한다', () => {
    expect(() => fail('잘못된 입력')).toThrow(GraphQLError);
    try {
      fail('없음', ERROR_CODE.NOT_FOUND);
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).extensions.code).toBe('NOT_FOUND');
    }
  });
});

describe('DomainError 호환 계약', () => {
  it.each(Object.values(ERROR_CODE))('업무 오류 %s의 타입·공개 code·메시지를 유지해야 한다', (code) => {
    const error = new DomainError('업무 오류', code);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.code).toBe(code);
    expect(error.toJSON()).toEqual({ message: '업무 오류', extensions: { code } });
    expect(httpStatusOf(error.extensions.code)).toBe(httpStatusOf(error.code));
  });

  it('fail()은 DomainError를 던지고 기본 오류 코드를 유지해야 한다', () => {
    expect(() => fail('잘못된 입력')).toThrow(DomainError);
    expect(new DomainError('잘못된 입력').code).toBe(ERROR_CODE.BAD_USER_INPUT);
  });

  it('GraphQL 엔진에서 새 오류 타입을 기존 code와 필드 경로로 직렬화해야 한다', async () => {
    const result = await graphql({
      schema: buildSchema('type Query { item: String }'),
      source: '{ item }',
      rootValue: { item: () => fail('없음', ERROR_CODE.NOT_FOUND) },
    });
    expect(result.data).toEqual({ item: null });
    const [error] = result.errors ?? [];
    expect(error?.originalError).toBeInstanceOf(DomainError);
    expect(error?.toJSON()).toMatchObject({
      message: '없음',
      path: ['item'],
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
