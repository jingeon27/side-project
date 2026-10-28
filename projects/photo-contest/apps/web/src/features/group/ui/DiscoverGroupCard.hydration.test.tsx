import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { DiscoverGroupFragmentDoc, GroupVisibility, MeDocument } from '@/shared/api/generated';

import { DiscoverGroupCard } from './DiscoverGroupCard';

const promptLogin = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth', () => ({ useLoginPrompt: () => promptLogin }));

function setup() {
  const cache = new InMemoryCache();
  cache.writeFragment({
    fragment: DiscoverGroupFragmentDoc,
    fragmentName: 'DiscoverGroup',
    data: {
      __typename: 'Group',
      id: 'private-group',
      name: '비공개 모임',
      description: '',
      avatarUrl: null,
      visibility: GroupVisibility.Private,
      role: null,
      memberCount: 1,
      canViewPosts: false,
      joinRequestPending: false,
    },
  });
  const client = new ApolloClient({ cache, link: new MockLink([]) });
  const ui = (
    <ApolloProvider client={client}>
      <DiscoverGroupCard id="private-group" />
    </ApolloProvider>
  );
  const receiveViewer = () =>
    cache.writeQuery({
      query: MeDocument,
      data: {
        me: {
          __typename: 'User',
          id: 'anonymous',
          nickname: '익명 사용자',
          avatar: null,
          needsOnboarding: false,
          isAnonymous: true,
        },
      },
    });
  promptLogin.mockClear();
  return { ui, receiveViewer };
}

it('비공개 그룹은 hydration 뒤 첫 클릭으로 로그인 안내를 연다', async () => {
  const { ui, receiveViewer } = setup();
  receiveViewer();
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(ui);
  const link = within(container).getByRole('link', { name: '비공개 모임' });
  expect(link).toHaveAttribute('aria-disabled', 'true');
  expect(link).toHaveAttribute('inert');
  const root = await act(async () => hydrateRoot(container, ui));
  try {
    await waitFor(() => expect(link).toHaveAttribute('aria-disabled', 'false'));
    expect(link).not.toHaveAttribute('inert');
    await userEvent.setup().click(within(link).getByText('둘러보기', { exact: true }));
    expect(promptLogin).toHaveBeenCalledExactlyOnceWith('/groups/private-group');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('사용자 정보를 받기 전에는 익명 안내를 건너뛰어 이동하지 않는다', async () => {
  const { ui, receiveViewer } = setup();
  render(ui);
  const link = screen.getByRole('link', { name: '비공개 모임' });
  expect(link).toHaveAttribute('aria-disabled', 'true');
  expect(link).toHaveAttribute('inert');
  await userEvent.setup().click(link);
  expect(promptLogin).not.toHaveBeenCalled();
  await act(async () => {
    receiveViewer();
  });
  await waitFor(() => expect(link).toHaveAttribute('aria-disabled', 'false'));
  await userEvent.setup().click(link);
  expect(promptLogin).toHaveBeenCalledExactlyOnceWith('/groups/private-group');
});
