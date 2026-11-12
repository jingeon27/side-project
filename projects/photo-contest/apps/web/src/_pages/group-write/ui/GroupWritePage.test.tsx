import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { GalleryDocument, GroupRole, GroupVisibility, type GalleryQuery } from '@/shared/api/generated';

import { GroupWritePage } from './GroupWritePage';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1/write',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const gallery = (name: string): GalleryQuery => ({
  group: {
    __typename: 'Group',
    coverUrl: null,
    description: '',
    avatarUrl: null,
    name,
    inviteToken: null,
    id: 'group-1',
    visibility: GroupVisibility.Public,
    role: GroupRole.Member,
    memberCount: 1,
    canViewPosts: true,
    joinRequestPending: false,
    members: [],
    categories: [],
  },
});

it('그룹 이름을 브라우저 캐시에서 읽어 이름이 바뀌면 글쓰기 머리도 따라 바꿔야 한다', async () => {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({ query: GalleryDocument, variables: { id: 'group-1' }, data: gallery('웃음 연구소') });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <GroupWritePage groupId="group-1" />
      </ApolloProvider>,
    );
  });
  expect(screen.getByText('웃음 연구소')).toBeVisible();

  act(() =>
    client.writeQuery({
      query: GalleryDocument,
      variables: { id: 'group-1' },
      data: gallery('새 이름 연구소'),
    }),
  );

  expect(await screen.findByText('새 이름 연구소')).toBeVisible();
  expect(screen.queryByText('웃음 연구소')).not.toBeInTheDocument();
});
