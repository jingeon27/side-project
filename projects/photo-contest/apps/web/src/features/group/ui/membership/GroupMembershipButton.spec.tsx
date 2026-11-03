import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { GroupAccessFragmentDoc, GroupVisibility, MeDocument } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';

import { GroupMembershipButton } from './GroupMembershipButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it('세션이 없으면 인증 화면 링크를 보여 주고 클릭을 한 번 기록해야 한다', () => {
  window.history.replaceState(null, '', '/groups/group-1?category=c1');
  const cache = new InMemoryCache();
  cache.writeQuery({ query: MeDocument, data: { me: null } });
  cache.writeFragment({
    fragment: GroupAccessFragmentDoc,
    data: {
      __typename: 'Group',
      id: 'group-1',
      visibility: GroupVisibility.Public,
      role: null,
      memberCount: 1,
      canViewPosts: true,
      joinRequestPending: false,
    },
  });
  render(
    <ApolloProvider client={new ApolloClient({ cache, link: ApolloLink.empty() })}>
      <GroupMembershipButton groupId="group-1" />
    </ApolloProvider>,
  );
  const link = screen.getByRole('link', { name: '로그인하고 가입하기' });
  expect(link).toHaveAttribute('href', '/sign?next=%2Fgroups%2Fgroup-1');
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link, { ctrlKey: true });
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.SignEntryClicked, {
    placement: 'group_join',
    source_path_template: '/groups/:id',
    destination_path_template: '/groups/:id',
  });
});
