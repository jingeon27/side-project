import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotificationCounter } from './NotificationCounter';

/** 첫 조회는 바로 답하고, 이후 갱신은 release를 부를 때까지 응답을 미룬다. */
function createGatedClient() {
  const pending: Array<() => void> = [];
  const operations: string[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        operations.push(operation.operationName ?? '');
        const count = operations.length;
        const respond = () => {
          sink.next({ data: { notificationUnreadCount: count } });
          sink.complete();
        };
        if (count === 1) {
          queueMicrotask(respond);
          return;
        }
        pending.push(respond);
      }),
  );
  return {
    client: new ApolloClient({ cache: new InMemoryCache(), link }),
    operations,
    release: () => pending.splice(0).forEach((respond) => respond()),
  };
}

describe('NotificationCounter 회귀', () => {
  it('다시 보일 때 개수를 새로 받는 동안 기존 개수를 유지하고 fallback으로 바꾸지 않아야 한다', async () => {
    const { client, operations, release } = createGatedClient();
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <NotificationCounter />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByRole('link', { name: '알림 1개' })).toBeVisible();

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(operations).toHaveLength(2));
    expect(screen.getByRole('link', { name: '알림 1개' })).toBeVisible();
    expect(screen.queryByRole('link', { name: '알림 0개' })).not.toBeInTheDocument();

    await act(async () => release());
    expect(await screen.findByRole('link', { name: '알림 2개' })).toBeVisible();
  });
});
