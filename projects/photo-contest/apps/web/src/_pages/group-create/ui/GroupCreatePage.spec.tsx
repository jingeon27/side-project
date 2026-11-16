import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeDocument, type MeQuery } from '@/shared/api/generated';
import { getParentRoute, routeHistoryStore } from '@/shared/model/router';

import { GroupCreatePage } from './GroupCreatePage';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/new',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => navigation,
}));

const ANONYMOUS = {
  __typename: 'User',
  id: 'anonymous',
  nickname: '익명',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: true,
} satisfies MeQuery['me'];

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/groups/new');
  routeHistoryStore.start('navigate');
});

function renderPage(me: MeQuery['me']) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({ query: MeDocument, data: { me } });
  render(
    <ApolloProvider client={client}>
      <GroupCreatePage />
    </ApolloProvider>,
  );
  return { client, user: userEvent.setup() };
}

describe('GroupCreatePage', () => {
  it('세션이 없으면 폼 대신 제자리에서 로그인 안내를 보여 줘야 한다', async () => {
    renderPage(null);
    expect(await screen.findByRole('button', { name: '익명으로 시작하기' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '그룹 만들기' })).not.toBeInTheDocument();
    expect(getParentRoute('/groups/new')).toBe('/');
  });

  it('익명 세션에도 폼을 보여 주고 직접 방문한 화면의 취소는 MY로 돌아가야 한다', async () => {
    const { user } = renderPage(ANONYMOUS);
    expect(await screen.findByRole('form', { name: '그룹 만들기' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/me', undefined);
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('앱 안에서 들어왔다면 취소할 때 이전 검색 화면으로 돌아가야 한다', async () => {
    routeHistoryStore.record('/groups/new');
    const { user } = renderPage(ANONYMOUS);
    await user.click(await screen.findByRole('button', { name: '취소' }));
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('세션이 사라지면 폼을 닫고 비로그인 화면의 상위 경로를 홈으로 복원해야 한다', async () => {
    const { client } = renderPage(ANONYMOUS);
    await screen.findByRole('form', { name: '그룹 만들기' });
    expect(getParentRoute('/groups/new')).toBe('/me');
    await act(async () => {
      client.writeQuery({ query: MeDocument, data: { me: null } });
    });
    expect(await screen.findByRole('button', { name: '익명으로 시작하기' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '그룹 만들기' })).not.toBeInTheDocument();
    expect(getParentRoute('/groups/new')).toBe('/');
  });
});
