import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  DiscoverGroupsDocument,
  GalleryPostsDocument,
  GroupRole,
  GroupVisibility,
  MyGroupsDocument,
  PostSort,
  PublicGalleryPostsDocument,
} from '@/shared/api/generated';

import { MemberHome } from './MemberHome';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

it('서버 화면을 연결하는 동안 가입 캐시가 바뀌어도 hydration 오류 없이 내 피드로 전환해야 한다', async () => {
  const cache = new InMemoryCache();
  cache.writeQuery({ query: MyGroupsDocument, data: { myGroups: [] } });
  cache.writeQuery({
    query: DiscoverGroupsDocument,
    variables: { visibility: GroupVisibility.Public, offset: 0, limit: 6 },
    data: { discoverGroups: [] },
  });
  cache.writeQuery({
    query: PublicGalleryPostsDocument,
    variables: { sort: PostSort.Newest, offset: 0, limit: 24 },
    data: { publicGalleryPosts: [] },
  });
  for (const [sort, limit] of [
    [PostSort.Newest, 24],
    [PostSort.MonthlyPopular, 3],
  ] as const) {
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort, offset: 0, limit },
      data: { galleryPosts: [] },
    });
  }
  const serverClient = new ApolloClient({ cache, link: ApolloLink.empty() });
  const serverTree = (
    <ApolloProvider client={serverClient}>
      <MemberHome initialHasGroups={false} />
    </ApolloProvider>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(serverTree);
  document.body.append(container);
  expect(within(container).getByRole('region', { name: '공개 그룹 목록' })).toBeInTheDocument();
  const browserCache = new InMemoryCache().restore(cache.extract());
  browserCache.writeQuery({
    query: MyGroupsDocument,
    data: {
      myGroups: [
        {
          __typename: 'Group',
          description: '',
          avatarUrl: null,
          id: 'joined',
          name: '새 그룹',
          role: GroupRole.Member,
          members: [],
        },
      ],
    },
  });
  const client = new ApolloClient({ cache: browserCache, link: ApolloLink.empty() });
  const tree = (
    <ApolloProvider client={client}>
      <MemberHome initialHasGroups={false} />
    </ApolloProvider>
  );
  const onRecoverableError = vi.fn();
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });
    expect(within(container).getByRole('region', { name: /^최신 게시물$/ })).toBeInTheDocument();
    expect(within(container).queryByRole('region', { name: '공개 그룹 목록' })).not.toBeInTheDocument();
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    client.stop();
    serverClient.stop();
  }
});
