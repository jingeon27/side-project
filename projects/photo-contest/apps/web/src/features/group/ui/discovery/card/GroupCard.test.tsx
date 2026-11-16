import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DiscoverGroupFragmentDoc,
  GroupRole,
  GroupVisibility,
  type GroupCardFragment,
} from '@/shared/api/generated';

import { DiscoverGroupCard } from './DiscoverGroupCard';
import { GroupCard } from './GroupCard';

vi.mock('@/features/auth', () => ({ useLoginPrompt: () => vi.fn() }));

const group: GroupCardFragment = {
  __typename: 'Group',
  id: 'group-1',
  name: '우리 웃음',
  description: '',
  avatarUrl: null,
  role: GroupRole.Owner,
  memberCount: 3,
};

describe('GroupCard', () => {
  it('MY 그룹 카드의 아바타는 탐색 카드와 같은 그룹 아바타여야 한다', () => {
    const cache = new InMemoryCache();
    cache.writeFragment({
      fragment: DiscoverGroupFragmentDoc,
      fragmentName: 'DiscoverGroup',
      data: { ...group, visibility: GroupVisibility.Public, canViewPosts: true, joinRequestPending: false },
    });
    const { container } = render(
      <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>
        <DiscoverGroupCard id={group.id} />
        <GroupCard group={group} />
      </ApolloProvider>,
    );
    const [explore, mine] = container.querySelectorAll('[data-slot="avatar"]');
    expect(explore).toBeInTheDocument();
    expect(mine?.className).toBe(explore?.className);
  });
});
