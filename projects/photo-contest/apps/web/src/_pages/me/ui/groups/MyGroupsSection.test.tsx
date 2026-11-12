import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MyGroupsDocument } from '@/shared/api/generated';

import { MyGroupsSection } from './MyGroupsSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('MyGroupsSection', () => {
  it('참여 그룹이 없으면 그라데이션 행동은 그룹 만들기 하나만 두고 탐색 이동은 보조 버튼으로 보여야 한다', async () => {
    const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
    client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [] } });
    const { container } = render(
      <ApolloProvider client={client}>
        <MyGroupsSection />
      </ApolloProvider>,
    );
    const explore = await screen.findByRole('link', { name: '그룹 탐색하기' });
    expect(explore).toHaveAttribute('href', '/explore');
    // 그라데이션은 만들기 같은 주 행동에만 둔다(docs/implementation.md).
    expect([...container.querySelectorAll('.bg-brand-gradient')]).toEqual([
      screen.getByRole('button', { name: '그룹 만들기' }),
    ]);
  });
});
