import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiscoverGroupFragmentDoc, GroupRole, GroupVisibility } from '@/shared/api/generated';

import { GroupPendingFrame } from './GroupPendingFrame';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1/contests',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function renderPending(canViewPosts?: boolean) {
  const cache = new InMemoryCache();
  if (canViewPosts !== undefined)
    cache.writeFragment({
      id: 'Group:group-1',
      fragment: DiscoverGroupFragmentDoc,
      fragmentName: 'DiscoverGroup',
      data: {
        __typename: 'Group',
        id: 'group-1',
        name: '이미 확인한 그룹',
        description: '',
        avatarUrl: null,
        role: GroupRole.Member,
        visibility: GroupVisibility.Public,
        memberCount: 1,
        canViewPosts,
        joinRequestPending: false,
      },
    });
  const client = new ApolloClient({
    cache,
    link: new ApolloLink(() => {
      throw new Error('로딩 화면은 새 요청을 시작하지 않는다');
    }),
  });
  render(
    <ApolloProvider client={client}>
      <GroupPendingFrame groupId="group-1" title="그룹 대회" backHref="/groups/group-1" />
    </ApolloProvider>,
  );
}

describe('그룹 탐색 중 표시', () => {
  it('이미 권한을 확인한 그룹은 새 조회 없이 메뉴와 현재 탭을 표시한다', () => {
    renderPending(true);
    expect(screen.getByRole('heading', { name: '그룹 대회' })).toBeVisible();
    expect(screen.getByRole('link', { name: '대회' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('status', { name: '그룹 본문 불러오는 중' })).toBeVisible();
  });

  it.each([false, undefined])('접근 권한이 없거나 확인되지 않으면 메뉴를 표시하지 않는다 (%s)', (access) => {
    renderPending(access);
    expect(screen.queryByRole('navigation', { name: '그룹 메뉴' })).not.toBeInTheDocument();
  });
});
