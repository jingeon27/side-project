import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { GroupJoinRequests } from './GroupJoinRequests';

const request = (id: string, nickname: string) => ({
  __typename: 'GroupJoinRequest' as const,
  id,
  groupId: 'group-1',
  user: { __typename: 'User' as const, id: `user-${id}`, nickname, avatar: null },
  createdAt: '2026-10-25T00:00:00.000Z',
});

describe('GroupJoinRequests 회귀', () => {
  it('신청을 새로고침하는 동안 기존 목록을 유지하고 받은 뒤 새 신청을 보여줘야 한다', async () => {
    const operations: string[] = [];
    const pending: Array<() => void> = [];
    const link = new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          operations.push(operation.operationName ?? '');
          const requests =
            operations.length === 1
              ? [request('request-1', '먼저 온 친구')]
              : [request('request-1', '먼저 온 친구'), request('request-2', '새로 온 친구')];
          const respond = () => {
            sink.next({ data: { groupJoinRequests: requests } });
            sink.complete();
          };
          if (operations.length === 1) {
            queueMicrotask(respond);
            return;
          }
          pending.push(respond);
        }),
    );
    const client = new ApolloClient({ cache: new InMemoryCache(), link });
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <GroupJoinRequests groupId="group-1" />
        </ApolloProvider>,
      );
    });
    const list = await screen.findByRole('list', { name: '그룹 가입 신청' });
    expect(screen.getByText('먼저 온 친구')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '신청 새로고침' }));
    await waitFor(() => expect(operations).toHaveLength(2));
    expect(screen.getByRole('list', { name: '그룹 가입 신청' })).toBe(list);
    expect(screen.getByText('먼저 온 친구')).toBeVisible();
    expect(screen.getByRole('button', { name: '신청 새로고침' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => pending.splice(0).forEach((respond) => respond()));
    expect(await screen.findByText('새로 온 친구')).toBeVisible();
    expect(screen.getByRole('button', { name: '신청 새로고침' })).not.toHaveAttribute('aria-busy');
  });
});
