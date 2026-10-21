import { describe, expect, it } from 'vitest';

import { graphqlMutation, mutationChangedData } from './graphql-mutation.helper';

describe('공개 캐시를 무효화할 GraphQL 쓰기', () => {
  it('쿼리·잘못된 문서·operation 선택 실패는 쓰기로 판단하지 않아야 한다', () => {
    for (const body of [
      null,
      {},
      { query: 'query { me { id } }' },
      { query: 'not graphql' },
      { query: 'mutation A { logout } mutation B { logout }' },
    ])
      expect(graphqlMutation(body)).toBeNull();
    expect(
      graphqlMutation({
        query: 'mutation A { first: deletePost(postId:"id") } mutation B { logout }',
        operationName: 'A',
      }),
    ).toEqual({ firstResponseKey: 'first' });
  });
  it('alias·인라인·이름 있는 fragment에서도 첫 실행 필드의 응답 키를 찾아야 한다', () => {
    expect(
      graphqlMutation({
        query:
          'mutation { ...Actions } fragment Actions on Mutation { ... on Mutation { removed: deletePost(postId:"id") } }',
      }),
    ).toEqual({ firstResponseKey: 'removed' });
    expect(graphqlMutation({ query: 'mutation { ...Loop } fragment Loop on Mutation { ...Loop }' })).toEqual({
      firstResponseKey: null,
    });
  });
  it('성공한 삭제·작성은 무효화하고 인증·입력 실패는 무효화하지 않아야 한다', () => {
    const mutation = { firstResponseKey: 'write' };
    for (const data of [{ write: true }, { write: false }, { write: { id: 'created' } }])
      expect(mutationChangedData(mutation, { data })).toBe(true);
    for (const result of [
      null,
      {},
      { data: null },
      { data: { write: null }, errors: [{ path: ['write'], extensions: { code: 'UNAUTHENTICATED' } }] },
    ])
      expect(mutationChangedData(mutation, result)).toBe(false);
  });
  it('앞선 쓰기 뒤 다른 필드가 실패해 data가 null이 되어도 무효화해야 한다', () => {
    expect(
      mutationChangedData({ firstResponseKey: 'removed' }, { data: null, errors: [{ path: ['failed'] }] }),
    ).toBe(true);
    expect(
      mutationChangedData(
        { firstResponseKey: 'created' },
        { data: null, errors: [{ path: ['created', 'title'] }] },
      ),
    ).toBe(true);
    expect(
      mutationChangedData({ firstResponseKey: 'created' }, { errors: [{ message: 'validation failed' }] }),
    ).toBe(false);
  });
});
