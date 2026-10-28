import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCounter } from './NotificationCounter';

const visibility = vi.hoisted(() => ({ state: 'visible' as DocumentVisibilityState }));

beforeEach(() => {
  vi.useFakeTimers();
  visibility.state = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility.state);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createClient() {
  const operations: string[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        operations.push(operation.operationName ?? '');
        const count = operations.length;
        queueMicrotask(() => {
          sink.next({ data: { notificationUnreadCount: count } });
          sink.complete();
        });
      }),
  );
  return { client: new ApolloClient({ cache: new InMemoryCache(), link }), operations };
}

async function renderCounter(client: ApolloClient) {
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <NotificationCounter />
      </ApolloProvider>,
    );
  });
}

/** 갱신 응답은 캐시에 쓴 다음 tick에 화면에 반영된다. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms + 1));

describe('NotificationCounter', () => {
  it('보이는 동안 15초마다 읽지 않은 개수를 새로 받아야 한다', async () => {
    const { client, operations } = createClient();
    await renderCounter(client);
    expect(screen.getByRole('link', { name: '알림 1개' })).toBeInTheDocument();

    await advance(15_000);
    expect(operations).toHaveLength(2);
    expect(screen.getByRole('link', { name: '알림 2개' })).toBeInTheDocument();
  });

  it('가려진 동안에는 갱신을 건너뛰고 다시 보이면 바로 받아야 한다', async () => {
    const { client, operations } = createClient();
    await renderCounter(client);
    visibility.state = 'hidden';
    await advance(45_000);
    expect(operations).toHaveLength(1);

    visibility.state = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(0);
    expect(operations).toHaveLength(2);
    expect(screen.getByRole('link', { name: '알림 2개' })).toBeInTheDocument();
  });
});
