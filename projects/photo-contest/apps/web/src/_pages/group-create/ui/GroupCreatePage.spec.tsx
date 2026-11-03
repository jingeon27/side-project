import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MeDocument, type MeQuery } from '@/shared/api/generated';

import { GroupCreatePage } from './GroupCreatePage';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/new',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

function renderPage(me: MeQuery['me']) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({ query: MeDocument, data: { me } });
  render(
    <ApolloProvider client={client}>
      <GroupCreatePage />
    </ApolloProvider>,
  );
}

describe('GroupCreatePage', () => {
  it('세션이 없으면 폼 대신 제자리에서 로그인 안내를 보여 줘야 한다', async () => {
    renderPage(null);
    expect(await screen.findByRole('button', { name: '익명으로 시작하기' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '그룹 만들기' })).not.toBeInTheDocument();
  });

  it('익명 세션에도 그룹 만들기 폼을 보여 줘야 한다', async () => {
    renderPage({
      __typename: 'User',
      id: 'anonymous',
      nickname: '익명',
      avatar: null,
      needsOnboarding: false,
      isAnonymous: true,
    });
    expect(await screen.findByRole('form', { name: '그룹 만들기' })).toBeInTheDocument();
  });
});
