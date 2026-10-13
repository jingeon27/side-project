import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import { maskInternalError, reportableError } from './graphql-options';

class FakePrismaError extends Error {
  code = 'P2002';
  name = 'PrismaClientKnownRequestError';
}

describe('GraphQL 오류 마스킹', () => {
  it('Sentry로 보내는 오류에는 원본 메시지 대신 종류·코드·호출 위치만 남겨야 한다', () => {
    const original = new FakePrismaError('Invalid `prisma.user.create()` invocation: nickname "홍길동"');
    const reported = reportableError(new GraphQLError('wrapped', { originalError: original }));
    expect(reported.message).toBe('GraphQL operation failed: PrismaClientKnownRequestError P2002');
    expect(reported.stack).not.toContain('홍길동');
    expect(reported.stack).toContain('graphql-options.spec.ts');
  });

  it('내부 오류는 정해진 문장으로 바꾸고 나머지 오류는 그대로 둬야 한다', () => {
    const internal = maskInternalError(
      {
        message: 'connect ECONNREFUSED 10.0.0.1:5432',
        path: ['me'],
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      },
      new Error('connect ECONNREFUSED'),
    );
    expect(internal).toEqual({
      message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      path: ['me'],
      locations: undefined,
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    const forbidden = { message: '이 그룹에 접근할 권한이 없습니다.', extensions: { code: 'FORBIDDEN' } };
    expect(maskInternalError(forbidden, new Error())).toBe(forbidden);
  });
});
