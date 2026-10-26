import { describe, expect, expectTypeOf, it } from 'vitest';

import { controlResponseSchema, controlStateSchema, databaseOwnerSchema } from './database-state';

describe('로컬 DB 제어 데이터', () => {
  it('검증한 값에서 포트와 토큰 타입이 추론되어야 한다', () => {
    const state = controlStateSchema.parse({ port: 12345, token: 'a'.repeat(64) });
    expectTypeOf(state.port).toEqualTypeOf<number>();
    expectTypeOf(state.token).toEqualTypeOf<string>();
    expect(state.port).toBe(12345);
  });

  it.each([
    { port: '12345', token: 'a'.repeat(64) },
    { port: 65536, token: 'a'.repeat(64) },
    { port: 12345, token: 'invalid' },
  ])('잘못된 제어 주소를 허용하지 않아야 한다', (state) => {
    expect(controlStateSchema.safeParse(state).success).toBe(false);
  });

  it('성공 여부와 소유자 필드가 빠진 JSON을 유효한 데이터로 해석하지 않아야 한다', () => {
    expect(controlResponseSchema.safeParse({ ready: 'true', database: 'test', port: 12345 }).success).toBe(
      false,
    );
    expect(databaseOwnerSchema.safeParse({ project: '/tmp/project', user: 'owner' }).success).toBe(false);
  });
});
