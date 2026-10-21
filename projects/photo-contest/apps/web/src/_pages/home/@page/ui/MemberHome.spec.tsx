import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GalleryPostsDocument, GroupRole, MyGroupsDocument, PostSort } from '@/shared/api/generated';
import type { InMemoryCache } from '@apollo/client';

import {
  createBrowserClient,
  createServerClient,
  hydrateOnClient,
  renderOnServer,
} from '../../../../../test/support/ssr-hydration';
import { MemberHome } from './MemberHome';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function seedMyGroups(cache: InMemoryCache) {
  cache.writeQuery({
    query: MyGroupsDocument,
    data: {
      myGroups: [
        {
          __typename: 'Group',
          description: '',
          avatarUrl: null,
          id: 'group-1',
          name: '우리 웃음',
          role: GroupRole.Member,
          members: [
            { __typename: 'Member', role: GroupRole.Member, user: { __typename: 'User', id: 'viewer' } },
          ],
        },
      ],
    },
  });
}
function seedFeeds(cache: InMemoryCache) {
  for (const [sort, limit] of [
    [PostSort.Newest, 24],
    [PostSort.MonthlyPopular, 3],
  ] as const)
    cache.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort, offset: 0, limit },
      data: { galleryPosts: [] },
    });
}
const respondEmptyFeed = (name: string) => (name === 'GalleryPosts' ? { galleryPosts: [] } : {});

describe('홈의 개인 피드 SSR·hydration', () => {
  it('사전 조회하지 않은 피드는 틀만 서버 HTML에 그리고 hydration 뒤 브라우저에서 받아야 한다', async () => {
    const server = createServerClient(seedMyGroups);
    const { html, errors } = await renderOnServer(server, <MemberHome feedPreloaded={false} />);
    expect(errors).toEqual([]);
    expect(html).toContain('최신 게시물');
    expect(html).toContain('이달의 인기');
    expect(html).not.toContain('첫 사진을 올려보세요');

    const browser = createBrowserClient(server, respondEmptyFeed);
    const view = await hydrateOnClient(html, browser.client, <MemberHome feedPreloaded={false} />);
    try {
      expect(await within(view.container).findByText('첫 사진을 올려보세요')).toBeVisible();
      expect(browser.operations).toEqual(['GalleryPosts', 'GalleryPosts']);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });

  it('사전 조회한 피드는 서버 HTML에 목록을 그리고 hydration 뒤 다시 요청하지 않아야 한다', async () => {
    const server = createServerClient((cache) => {
      seedMyGroups(cache);
      seedFeeds(cache);
    });
    const { html, errors } = await renderOnServer(server, <MemberHome feedPreloaded />);
    expect(errors).toEqual([]);
    expect(html).toContain('첫 사진을 올려보세요');

    const browser = createBrowserClient(server, respondEmptyFeed);
    const view = await hydrateOnClient(html, browser.client, <MemberHome feedPreloaded />);
    try {
      expect(within(view.container).getByText('첫 사진을 올려보세요')).toBeVisible();
      expect(browser.operations).toEqual([]);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
