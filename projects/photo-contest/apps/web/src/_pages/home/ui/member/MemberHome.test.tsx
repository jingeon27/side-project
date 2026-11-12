import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { GroupCard } from '@/features/group';
import {
  DiscoverGroupsDocument,
  GalleryPostsDocument,
  GroupRole,
  GroupVisibility,
  MyGroupsDocument,
  PostSort,
  PublicGalleryPostsDocument,
  type GroupCardFragment,
} from '@/shared/api/generated';

import { MemberHome } from './MemberHome';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

it('서버 화면을 연결하는 동안 가입 캐시가 바뀌어도 hydration 오류 없이 내 피드로 전환해야 한다', async () => {
  const cache = new InMemoryCache();
  cache.writeQuery({ query: MyGroupsDocument, data: { myGroups: [] } });
  cache.writeQuery({
    query: DiscoverGroupsDocument,
    variables: { visibility: GroupVisibility.Public, offset: 0, limit: 6 },
    data: { discoverGroupsPage: { __typename: 'DiscoverGroupPage', items: [], nextOffset: null } },
  });
  cache.writeQuery({
    query: PublicGalleryPostsDocument,
    variables: { sort: PostSort.Newest, offset: 0, limit: 24 },
    data: { publicGalleryPostsPage: { __typename: 'GalleryPostPage', items: [], nextOffset: null } },
  });
  for (const [sort, limit] of [
    [PostSort.Newest, 24],
    [PostSort.MonthlyPopular, 3],
  ] as const) {
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort, offset: 0, limit },
      data: { galleryPostsPage: { __typename: 'GalleryPostPage', items: [], nextOffset: null } },
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
          memberCount: 0,
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

/** 아바타의 바탕·테두리·글자색 클래스. 크기마다 다른 글자 크기는 뺀다. */
function toneClasses(avatar: Element | null) {
  return [...(avatar?.classList ?? [])]
    .filter((name) => /^(?:bg-|border|text-)/.test(name) && !/^text-(?:caption|label|title)$/.test(name))
    .sort();
}

it('그룹 바로 가기 아바타는 MY 그룹 카드와 같은 색의 둥근 사각형이어야 한다', async () => {
  const group: GroupCardFragment = {
    __typename: 'Group',
    description: '',
    avatarUrl: null,
    id: 'joined',
    name: '우리 웃음',
    role: GroupRole.Member,
    memberCount: 1,
  };
  const cache = new InMemoryCache();
  cache.writeQuery({ query: MyGroupsDocument, data: { myGroups: [group] } });
  for (const [sort, limit] of [
    [PostSort.Newest, 24],
    [PostSort.MonthlyPopular, 3],
  ] as const) {
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort, offset: 0, limit },
      data: { galleryPostsPage: { __typename: 'GalleryPostPage', items: [], nextOffset: null } },
    });
  }
  const client = new ApolloClient({ cache, link: ApolloLink.empty() });
  try {
    render(
      <ApolloProvider client={client}>
        <MemberHome initialHasGroups />
      </ApolloProvider>,
    );
    const shortcut = (await screen.findByRole('link', { name: '우리 웃음' })).querySelector(
      '[data-slot="avatar"]',
    );
    const card = render(<GroupCard group={group} />).container.querySelector('[data-slot="avatar"]');
    expect(shortcut).toBeInTheDocument();
    expect(toneClasses(card)).not.toEqual([]);
    expect(toneClasses(shortcut)).toEqual(toneClasses(card));
    expect(shortcut).not.toHaveClass('rounded-full');
  } finally {
    client.stop();
  }
});
