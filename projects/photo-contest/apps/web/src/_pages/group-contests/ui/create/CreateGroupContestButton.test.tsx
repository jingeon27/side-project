import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateGroupButton } from '@/features/group';
import { CreatePostButton } from '@/features/post';
import { GroupAccessFragmentDoc, GroupRole, GroupVisibility } from '@/shared/api/generated';

import { CreateGroupContestButton } from './CreateGroupContestButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

describe('CreateGroupContestButton', () => {
  it('대회 개최하기는 그룹 만들기·대회 글쓰기와 같은 그라데이션 알약 만들기 진입이어야 한다', () => {
    const cache = new InMemoryCache();
    cache.writeFragment({
      fragment: GroupAccessFragmentDoc,
      data: {
        __typename: 'Group',
        id: 'group-1',
        visibility: GroupVisibility.Public,
        role: GroupRole.Moderator,
        memberCount: 3,
        canViewPosts: true,
        joinRequestPending: false,
      },
    });
    render(
      <ApolloProvider client={new ApolloClient({ cache, link: ApolloLink.empty() })}>
        <CreateGroupButton />
        <CreatePostButton groupId="group-1" contestId="contest-1" />
        <CreateGroupContestButton groupId="group-1" />
      </ApolloProvider>,
    );
    const host = screen.getByRole('button', { name: '대회 개최하기' });
    expect(host).toHaveClass('bg-brand-gradient', 'rounded-full');
    // 그라데이션 알약은 만들기 같은 주 행동이다(docs/implementation.md). 세 진입은 화면이 달라도 같은 모양이어야 한다.
    expect(host.className).toBe(screen.getByRole('button', { name: '그룹 만들기' }).className);
    expect(host.className).toBe(screen.getByRole('link', { name: '글쓰기' }).className);
  });
});
