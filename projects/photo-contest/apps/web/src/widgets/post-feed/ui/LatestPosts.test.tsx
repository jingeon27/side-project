import { useState } from 'react';

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GalleryPostsDocument,
  PostKind,
  PostSort,
  type GalleryPostCardFragment,
} from '@/shared/api/generated';
import { offsetPagePagination } from '@/shared/api/offset-page-pagination';
import { initAnalytics, resetAnalyticsClientForTest } from '@/shared/model/analytics/analytics.store';

import { LatestPosts } from './LatestPosts';

const sdk = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => ({ init: vi.fn(), identify: vi.fn(), track: sdk.track }),
  Identify: class {
    set() {
      return this;
    }
  },
}));

function CategoryFeed() {
  const [categoryId, setCategoryId] = useState('failed');
  return (
    <>
      <button type="button" onClick={() => setCategoryId('working')}>
        다른 카테고리
      </button>
      <LatestPosts
        groupId="group-1"
        categoryId={categoryId}
        title="최신 게시물"
        empty={<p>선택한 카테고리는 비어 있어요</p>}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sdk.track.mockClear();
  resetAnalyticsClientForTest();
});

describe('카테고리별 게시물 경계', () => {
  it('목록 실패 뒤에도 필터를 유지하고 새 카테고리는 이전 오류 경계에서 복구해야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const variables = { groupId: 'group-1', sort: PostSort.Newest, offset: 0, limit: 24 };
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([
        {
          request: { query: GalleryPostsDocument, variables: { ...variables, categoryId: 'failed' } },
          error: new Error('목록 연결 실패'),
          delay: 0,
        },
        {
          request: { query: GalleryPostsDocument, variables: { ...variables, categoryId: 'working' } },
          result: {
            data: { galleryPostsPage: { __typename: 'GalleryPostPage', items: [], nextOffset: null } },
          },
          delay: 0,
        },
      ]),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <CategoryFeed />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: '다른 카테고리' })).toBeEnabled();
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: '다른 카테고리' }));
    });
    expect(await screen.findByText('선택한 카테고리는 비어 있어요')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('스크롤로 다음 페이지가 도착했을 때 목록 종류와 offset만 한 번 보내야 한다', async () => {
  initAnalytics({ apiKey: 'test-key', app: null });
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        if (target instanceof HTMLDivElement) callbacks.push(this.callback);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  const posts = Array.from({ length: 25 }, (_, index): GalleryPostCardFragment => ({
    __typename: 'GalleryPost',
    id: `post-${index}`,
    groupId: 'group-1',
    groupName: '그룹',
    title: `게시물 ${index}`,
    body: '',
    category: null,
    contestId: null,
    contest: null,
    kind: PostKind.Link,
    mediaUrl: null,
    linkUrl: 'https://example.com',
    createdAt: '2026-11-01T00:00:00.000Z',
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: false,
    author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
  }));
  const variables = { groupId: 'group-1', sort: PostSort.Newest, offset: 0, limit: 24 };
  const cache = new InMemoryCache({
    typePolicies: { Query: { fields: { galleryPostsPage: offsetPagePagination(['groupId', 'sort']) } } },
  });
  cache.writeQuery({
    query: GalleryPostsDocument,
    variables,
    data: { galleryPostsPage: { __typename: 'GalleryPostPage', items: posts.slice(0, 24), nextOffset: 24 } },
  });
  const client = new ApolloClient({
    cache,
    link: new MockLink([
      {
        request: { query: GalleryPostsDocument, variables: { ...variables, offset: 24 } },
        result: {
          data: {
            galleryPostsPage: { __typename: 'GalleryPostPage', items: posts.slice(24), nextOffset: null },
          },
        },
      },
    ]),
  });
  const view = render(
    <ApolloProvider client={client}>
      <LatestPosts groupId="group-1" title="최신 게시물" empty="게시물이 없어요" />
    </ApolloProvider>,
  );
  try {
    expect(await screen.findByRole('article', { name: '게시물 23' })).toBeVisible();
    expect(sdk.track).not.toHaveBeenCalled();
    const onIntersection = callbacks.at(-1);
    expect(onIntersection).toBeDefined();
    await act(async () =>
      onIntersection?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
    expect(await screen.findByRole('article', { name: '게시물 24' })).toBeVisible();
    expect(sdk.track.mock.calls).toEqual([['post_list_page_loaded', { surface: 'latest', offset: 24 }]]);
  } finally {
    view.unmount();
    client.stop();
  }
});
