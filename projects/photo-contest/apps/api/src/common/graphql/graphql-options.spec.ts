import { describe, expect, it } from 'vitest';

import { maskInternalError } from './graphql-options';

describe('GraphQL 오류 마스킹', () => {
  it('내부 오류는 정해진 문장으로 바꾸고 나머지 오류는 그대로 둬야 한다', () => {
    const internal = maskInternalError({
      message: 'connect ECONNREFUSED 10.0.0.1:5432',
      path: ['me'],
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(internal).toEqual({
      message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      path: ['me'],
      locations: undefined,
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    const forbidden = { message: '이 그룹에 접근할 권한이 없습니다.', extensions: { code: 'FORBIDDEN' } };
    expect(maskInternalError(forbidden)).toBe(forbidden);
  });
});
