import { Suspense, useState, useTransition } from 'react';

import { ApolloClient, ApolloLink, gql, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery, type QueryRef } from '@apollo/client/react';
import { offsetLimitPagination } from '@apollo/client/utilities';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useInfiniteQuery } from './infinite-query.hook';

interface IItem {
  __typename: 'Item';
  id: string;
}
interface IData {
  items: IItem[];
}
const DOCUMENT: TypedDocumentNode<IData, { offset: number; limit: number; scope: string }> = gql`
  query InfiniteItems($offset: Int!, $limit: Int!, $scope: String!) {
    items(offset: $offset, limit: $limit, scope: $scope) {
      __typename
      id
    }
  }
`;
const clients: ApolloClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.stop()));

function List({ queryRef }: { queryRef: QueryRef<IData> }) {
  const { items, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useInfiniteQuery(queryRef, {
    select: (data) => data.items,
    pageSize: 2,
  });
  const [refreshing, startTransition] = useTransition();
  return (
    <>
      <ul aria-label="목록">
        {items.map((item) => (
          <li key={item.id}>{item.id}</li>
        ))}
      </ul>
      {hasNextPage ? (
        <button type="button" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          더 보기
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          fetchNextPage();
          fetchNextPage();
        }}
      >
        연속 조회
      </button>
      <button
        type="button"
        disabled={refreshing}
        onClick={() =>
          startTransition(async () => {
            await refetch();
          })
        }
      >
        새로고침
      </button>
    </>
  );
}

function Query() {
  const [scope, setScope] = useState('first');
  const [queryRef] = useBackgroundQuery(DOCUMENT, {
    variables: { scope, offset: 0, limit: 2 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <>
      <button type="button" onClick={() => setScope('second')}>
        다른 목록
      </button>
      <Suspense fallback={<p>조회 중</p>}>
        <List queryRef={queryRef} />
      </Suspense>
    </>
  );
}

async function setup(rows: Record<string, string[]>) {
  const requests: Array<{ scope: string; offset: number }> = [];
  const client = new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: { Query: { fields: { items: offsetLimitPagination(['scope']) } } },
    }),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const { scope, offset, limit } = operation.variables;
          requests.push({ scope, offset });
          queueMicrotask(() => {
            observer.next({
              data: {
                items:
                  rows[scope]?.slice(offset, offset + limit).map((id) => ({ __typename: 'Item', id })) ?? [],
              },
            });
            observer.complete();
          });
        }),
    ),
  });
  clients.push(client);
  await client.query({ query: DOCUMENT, variables: { scope: 'first', offset: 0, limit: 2 } });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <Query />
      </ApolloProvider>,
    );
  });
  return requests;
}

describe('useInfiniteQuery', () => {
  it('Apollo 목록을 이어 읽고 짧은 마지막 페이지에서 멈춰야 한다', async () => {
    const requests = await setup({ first: ['a', 'b', 'c', 'd', 'e'] });
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    await screen.findByText('d');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    await screen.findByText('e');
    await waitFor(() => expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull());
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(requests.map((request) => request.offset)).toEqual([0, 2, 4]);
  });

  it('같은 순간의 추가 조회를 합치고 다른 QueryRef에서는 끝 상태를 초기화해야 한다', async () => {
    const requests = await setup({ first: ['a', 'b'], second: ['x', 'y', 'z'] });
    await screen.findByText('b');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '연속 조회' }));
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull());
    expect(requests.filter((request) => request.offset === 2)).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다른 목록' }));
    });
    await screen.findByText('y');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    expect(requests.at(-1)).toEqual({ scope: 'second', offset: 2 });
    await screen.findByText('z');
    expect(screen.queryByText('a')).toBeNull();
  });

  it('첫 페이지가 같아도 새로고침 후 추가된 다음 페이지를 다시 읽을 수 있어야 한다', async () => {
    const rows = { first: ['a', 'b'] };
    await setup(rows);
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull());
    rows.first.push('c');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    });
    await screen.findByRole('button', { name: '더 보기' });
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    await screen.findByText('c');
  });
});
