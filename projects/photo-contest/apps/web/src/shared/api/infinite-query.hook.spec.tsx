import { useLayoutEffect, useState, useTransition } from 'react';

import { ApolloClient, ApolloLink, gql, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery, type QueryRef } from '@apollo/client/react';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AsyncBoundary } from '../ui/@core/async-boundary';
import { useInfiniteQuery } from './infinite-query.hook';
import { offsetPagePagination } from './offset-page-pagination';

interface IItem {
  __typename: 'Item';
  id: string;
}
interface IData {
  itemsPage: { items: IItem[]; nextOffset: number | null };
}
const DOCUMENT: TypedDocumentNode<IData, { offset: number; limit: number; scope: string }> = gql`
  query InfiniteItems($offset: Int!, $limit: Int!, $scope: String!) {
    itemsPage(offset: $offset, limit: $limit, scope: $scope) {
      nextOffset
      items {
        __typename
        id
      }
    }
  }
`;
type TCommit = { ids: string; hasNextPage: boolean; isFetchingNextPage: boolean } | '조회 중';
const clients: ApolloClient[] = [];
/** 화면에 반영된 상태만 순서대로 모은다. */
const commits: TCommit[] = [];
const loadedOffsets: number[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.stop());
  commits.length = 0;
  loadedOffsets.length = 0;
  vi.restoreAllMocks();
});

function useRecordCommit(commit: TCommit) {
  useLayoutEffect(() => {
    commits.push(commit);
  });
}

function Fallback() {
  useRecordCommit('조회 중');
  return <p>조회 중</p>;
}

function List({ queryRef }: { queryRef: QueryRef<IData> }) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useInfiniteQuery(
    queryRef,
    (result) => result.itemsPage.nextOffset,
    (offset) => loadedOffsets.push(offset),
  );
  const [refreshing, startTransition] = useTransition();
  const ids = data.itemsPage.items.map((item) => item.id).join('');
  useRecordCommit({ ids, hasNextPage, isFetchingNextPage });
  return (
    <>
      <ul aria-label="목록">
        {data.itemsPage.items.map((item) => (
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
  const [queryRef, { refetch }] = useBackgroundQuery(DOCUMENT, {
    variables: { scope, offset: 0, limit: 2 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <>
      <button type="button" onClick={() => setScope('second')}>
        다른 목록
      </button>
      <AsyncBoundary resetKey={scope} onRetry={refetch} fallback={<Fallback />}>
        <List queryRef={queryRef} />
      </AsyncBoundary>
    </>
  );
}

interface ISetupOptions {
  /** 처음 조회 뒤의 첫 페이지 요청은 이 Promise가 끝날 때까지 응답하지 않는다. */
  refetchGate?: Promise<void>;
  /** 다음 페이지 요청은 이 Promise가 끝날 때까지 응답하지 않는다. */
  nextPageGate?: Promise<void>;
  /** 이 offset의 첫 요청은 오류로 응답한다. */
  failOffset?: number;
}

async function setup(rows: Record<string, string[]>, options: ISetupOptions = {}) {
  const requests: Array<{ scope: string; offset: number }> = [];
  const client = new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: { Query: { fields: { itemsPage: offsetPagePagination(['scope']) } } },
    }),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const { scope, offset, limit } = operation.variables;
          const firstRequest = !requests.some((request) => request.offset === offset);
          const gate =
            offset === 0
              ? options.refetchGate && !firstRequest
                ? options.refetchGate
                : Promise.resolve()
              : (options.nextPageGate ?? Promise.resolve());
          requests.push({ scope, offset });
          void gate.then(() => {
            if (firstRequest && options.failOffset === offset) {
              observer.error(new Error('목록 연결 실패'));
              return;
            }
            const source = rows[scope] ?? [];
            const nextOffset = offset + limit;
            observer.next({
              data: {
                itemsPage: {
                  __typename: 'ItemPage',
                  items: source.slice(offset, nextOffset).map((id) => ({ __typename: 'Item', id })),
                  nextOffset: nextOffset < source.length ? nextOffset : null,
                },
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

const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

/** 같은 상태가 연달아 반영된 경우는 하나로 본다. */
function distinctCommits() {
  return commits.filter((commit, index) => JSON.stringify(commit) !== JSON.stringify(commits[index - 1]));
}

describe('useInfiniteQuery', () => {
  it('첫 페이지를 다시 받는 동안에는 이전 길이로 계산한 추가 조회를 보내지 않아야 한다', async () => {
    const refetchGate = Promise.withResolvers<void>();
    const requests = await setup({ first: ['a', 'b', 'c', 'd'] }, { refetchGate: refetchGate.promise });
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    expect(requests.filter((request) => request.offset === 2)).toHaveLength(0);
    await act(async () => refetchGate.resolve());
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    });
    expect(await screen.findByText('d')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
    expect(requests.map((request) => request.offset)).toEqual([0, 0, 2]);
    expect(loadedOffsets).toEqual([2]);
  });

  it('Apollo 목록을 이어 읽고 서버의 다음 offset이 null이면 멈춰야 한다', async () => {
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
    await click('연속 조회');
    expect(requests.map((request) => request.offset)).toEqual([0, 2, 4]);
    expect(loadedOffsets).toEqual([2, 4]);
  });

  it('다음 페이지를 받는 동안 이전 목록을 유지하고 새 페이지와 함께 조회 상태를 끝내야 한다', async () => {
    const nextPageGate = Promise.withResolvers<void>();
    await setup({ first: ['a', 'b', 'c', 'd', 'e'] }, { nextPageGate: nextPageGate.promise });
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await click('더 보기');
    expect(distinctCommits().at(-1)).toEqual({ ids: 'ab', hasNextPage: true, isFetchingNextPage: true });
    expect(loadedOffsets).toEqual([]);
    await act(async () => nextPageGate.resolve());
    await screen.findByText('d');
    expect(distinctCommits()).toEqual([
      { ids: 'ab', hasNextPage: true, isFetchingNextPage: false },
      { ids: 'ab', hasNextPage: true, isFetchingNextPage: true },
      { ids: 'abcd', hasNextPage: true, isFetchingNextPage: false },
    ]);
    expect(loadedOffsets).toEqual([2]);
  });

  it('다음 페이지 요청이 실패하면 오류 경계로 넘기고 다시 시도하면 첫 페이지부터 이어 읽어야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const requests = await setup({ first: ['a', 'b', 'c', 'd', 'e'] }, { failOffset: 2 });
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await click('더 보기');
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('list', { name: '목록' })).toBeNull();
    expect(loadedOffsets).toEqual([]);
    await click('다시 시도');
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await click('더 보기');
    await screen.findByText('d');
    expect(requests.map((request) => request.offset)).toEqual([0, 2, 0, 2]);
    expect(loadedOffsets).toEqual([2]);
  });

  it('다음 페이지를 받는 중 새로고침이 먼저 끝나도 그 요청이 끝날 때까지 추가 조회를 막아야 한다', async () => {
    const nextPageGate = Promise.withResolvers<void>();
    const requests = await setup(
      { first: ['a', 'b', 'c', 'd', 'e'] },
      { nextPageGate: nextPageGate.promise },
    );
    await screen.findByText('b');
    await waitFor(() => expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled());
    await click('더 보기');
    await click('새로고침');
    // 새로고침 버튼은 다음 페이지 전환과 함께 묶여 있어 응답 뒤에도 비활성이라 요청 기록으로 기다린다.
    await waitFor(() => expect(requests.map((request) => request.offset)).toEqual([0, 2, 0]));
    await click('연속 조회');
    await act(async () => nextPageGate.resolve());
    await screen.findByText('d');
    // Apollo가 같은 요청을 하나로 합쳐 보내므로, 중복 조회는 페이지 도착 콜백 횟수로 확인한다.
    expect(loadedOffsets).toEqual([2]);
    expect(requests.map((request) => request.offset)).toEqual([0, 2, 0]);
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('같은 순간의 추가 조회를 합치고 다른 QueryRef에서는 끝 상태를 초기화해야 한다', async () => {
    const requests = await setup({ first: ['a', 'b', 'c'], second: ['x', 'y', 'z'] });
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
    const requests = await setup(rows);
    await screen.findByText('b');
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
    expect(requests.map((request) => request.offset)).toEqual([0]);
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
