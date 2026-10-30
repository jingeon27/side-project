import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DiscoverGroupsDocument,
  GroupVisibility,
  PostKind,
  PostSort,
  PublicGalleryPostsDocument,
  type DiscoverGroupsQuery,
  type PublicGalleryPostsQuery,
} from '@/shared/api/generated';

import { NoGroupHome } from './NoGroupHome';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

async function renderHome(hasGroup: boolean, hasPost: boolean) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery<DiscoverGroupsQuery>({
    query: DiscoverGroupsDocument,
    variables: { visibility: GroupVisibility.Public, offset: 0, limit: 6 },
    data: {
      discoverGroups: hasGroup
        ? [
            {
              __typename: 'Group',
              id: 'public-group',
              name: '공개 웃음',
              description: '',
              avatarUrl: null,
              visibility: GroupVisibility.Public,
              role: null,
              memberCount: 1,
              canViewPosts: true,
              joinRequestPending: false,
            },
          ]
        : [],
    },
  });
  client.writeQuery<PublicGalleryPostsQuery>({
    query: PublicGalleryPostsDocument,
    variables: { sort: PostSort.Newest, offset: 0, limit: 24 },
    data: {
      publicGalleryPosts: hasPost
        ? [
            {
              __typename: 'GalleryPost',
              id: 'public-post',
              groupId: 'public-group',
              groupName: '공개 웃음',
              category: null,
              contestId: null,
              contest: null,
              title: '함께 웃은 순간',
              body: '친구들과 나눈 이야기',
              kind: PostKind.Photo,
              mediaUrl: null,
              linkUrl: null,
              createdAt: '2026-10-31T00:00:00Z',
              likeCount: 0,
              commentCount: 0,
              likedByMe: false,
              canDelete: false,
              canModerate: false,
              canInteract: false,
              author: { __typename: 'User', id: 'author', nickname: '웃음친구', avatar: null },
            },
          ]
        : [],
    },
  });
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <NoGroupHome signedIn />
      </ApolloProvider>,
    );
  });
}

describe('참여 그룹이 없는 홈의 첫 행동', () => {
  it.each([false, true])(
    '공개 그룹 유무(%s)와 관계없이 빈 사진 안내보다 그룹 찾기와 만들기를 먼저 안내해야 한다',
    async (hasGroup) => {
      await renderHome(hasGroup, false);
      expect(screen.getByRole('link', { name: '그룹 찾아보기' })).toHaveAttribute('href', '/explore');
      expect(screen.getAllByRole('button', { name: '그룹 만들기' })).toHaveLength(1);
      expect(screen.queryByText('첫 사진을 올려보세요')).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '공개 그룹의 최신 사진' })).not.toBeInTheDocument();
      if (hasGroup) expect(screen.getByRole('link', { name: '공개 웃음' })).toBeVisible();
      if (!hasGroup) expect(screen.getByText('참여할 그룹을 검색하거나 직접 만들어보세요.')).toBeVisible();
    },
  );

  it.each([false, true])(
    '공개 그룹 유무(%s)와 관계없이 실제 공개 게시물은 유지해야 한다',
    async (hasGroup) => {
      await renderHome(hasGroup, true);
      expect(screen.getByRole('region', { name: '공개 그룹의 최신 사진' })).toBeVisible();
      expect(screen.getByRole('article', { name: '함께 웃은 순간' })).toBeVisible();
      expect(screen.getByRole('link', { name: '그룹 보기' })).toHaveAttribute('href', '/groups/public-group');
    },
  );
});
