import { gql, InMemoryCache } from '@apollo/client';
import type { TypePolicies } from '@apollo/client/cache';
import { describe, expect, it } from 'vitest';

import { mergeTypePolicies } from './type-policies.helper';

const listPolicies: TypePolicies = {
  Query: {
    fields: {
      items: {
        keyArgs: ['listId'],
        merge: (existing: readonly unknown[] = [], incoming: readonly unknown[]) => [
          ...existing,
          ...incoming,
        ],
      },
    },
  },
};

const profilePolicies: TypePolicies = {
  Query: {
    fields: {
      greeting: { read: (existing: string | undefined) => existing?.toUpperCase() },
    },
  },
  Profile: { keyFields: ['handle'] },
};

const ITEMS = gql`
  query Items($listId: ID!, $offset: Int) {
    items(listId: $listId, offset: $offset) {
      id
    }
  }
`;
const GREETING = gql`
  query Greeting {
    greeting
    profile {
      handle
      name
    }
  }
`;

describe('mergeTypePolicies', () => {
  it('여러 도메인의 Query.fields를 하나의 Query 정책으로 합쳐야 한다', () => {
    const merged = mergeTypePolicies(listPolicies, profilePolicies);
    expect(Object.keys(merged.Query?.fields ?? {})).toEqual(['items', 'greeting']);
    expect(merged.Profile?.keyFields).toEqual(['handle']);
  });

  it('합친 정책이 실제 InMemoryCache에서 도메인마다 동작해야 한다', () => {
    const cache = new InMemoryCache({ typePolicies: mergeTypePolicies(listPolicies, profilePolicies) });
    const write = (offset: number, ids: string[]) =>
      cache.writeQuery({
        query: ITEMS,
        variables: { listId: 'l1', offset },
        data: { items: ids.map((id) => ({ __typename: 'Item', id })) },
      });
    write(0, ['a', 'b']);
    write(2, ['c']);
    // offset은 keyArgs가 아니라서 같은 목록에 이어 붙는다.
    expect(
      cache.readQuery<{ items: Array<{ id: string }> }>({ query: ITEMS, variables: { listId: 'l1' } })?.items,
    ).toEqual([
      { __typename: 'Item', id: 'a' },
      { __typename: 'Item', id: 'b' },
      { __typename: 'Item', id: 'c' },
    ]);

    cache.writeQuery({
      query: GREETING,
      data: { greeting: 'hello', profile: { __typename: 'Profile', handle: 'kim', name: '김' } },
    });
    expect(cache.readQuery<{ greeting: string }>({ query: GREETING })?.greeting).toBe('HELLO');
    expect(cache.extract()).toHaveProperty(['Profile:{"handle":"kim"}']);
  });

  it('원본 정책 객체를 바꾸지 않아야 한다', () => {
    mergeTypePolicies(listPolicies, profilePolicies);
    expect(Object.keys(listPolicies.Query?.fields ?? {})).toEqual(['items']);
  });

  it('같은 필드나 같은 타입 옵션을 두 도메인이 정의하면 실패해야 한다', () => {
    expect(() =>
      mergeTypePolicies(listPolicies, { Query: { fields: { items: { keyArgs: false } } } }),
    ).toThrow('typePolicies.Query.fields.items');
    expect(() => mergeTypePolicies(profilePolicies, { Profile: { keyFields: ['id'] } })).toThrow(
      'typePolicies.Profile.keyFields',
    );
  });
});
