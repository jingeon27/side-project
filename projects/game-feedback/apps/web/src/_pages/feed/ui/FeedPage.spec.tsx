import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sessionOptions, SessionProvider } from '@/features/auth';
import type { TPostListParams } from '@/features/post';
import type { Post, PostList } from '@/shared/api';
import { MotionProvider } from '@/shared/motion';

import type { IFeedSnapshot } from '../model/feed-snapshot.type';
import { FeedPage } from './FeedPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ko',
  useSearchParams: () => new URLSearchParams(),
}));
const io = vi.hoisted(() => ({ listPosts: vi.fn<(params?: TPostListParams) => Promise<PostList>>() }));
vi.mock('@game-feedback/sdk', async (original) => ({
  ...(await original<typeof import('@game-feedback/sdk')>()),
  listPosts: io.listPosts,
  getSession: async () => ({ user: null, demoMode: false, googleConfigured: false, needsOnboarding: false }),
}));

/** 실제 observer처럼 observe 직후 현재 교차 상태를 한 번 알리고, 그 뒤에는 상태가 바뀔 때만 알린다. */
const viewport = { endVisible: false };
const observers = new Set<IntersectionObserverCallback>();
const notify = (callback: IntersectionObserverCallback) =>
  callback(
    [{ isIntersecting: viewport.endVisible } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );

const category = { id: 'game', slug: 'clash-royale', name: '클래시로얄', active: true };
const post = (id: string, title: string): Post => ({
  id,
  title,
  body: '피드 본문',
  board: 'FREE',
  categoryId: category.id,
  category,
  author: { id: 'author', nickname: '작성자', isVerified: false, supercellTag: null, isTestAccount: false },
  gameProfile: null,
  viewCount: 0,
  answerCount: 0,
  helpfulCount: 0,
  createdAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
  updatedAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
  battle: null,
  coaching: null,
  friendSale: null,
});
const snapshot = (posts: PostList): IFeedSnapshot => ({ posts, q: '', tab: 'latest' });

const mount = (initialFeed: IFeedSnapshot) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionOptions().queryKey, {
    user: null,
    demoMode: false,
    googleConfigured: false,
    needsOnboarding: false,
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionProvider onLogin={vi.fn()}>
        <MotionProvider>
          <FeedPage locale="ko" initialFeed={initialFeed} />
        </MotionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return {
    unmount: () => {
      view.unmount();
      client.clear();
    },
  };
};

beforeEach(() => {
  viewport.endVisible = false;
  observers.clear();
  io.listPosts.mockReset();
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private connected = false;
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe() {
        this.connected = true;
        observers.add(this.callback);
        queueMicrotask(() => {
          if (this.connected) notify(this.callback);
        });
      }
      disconnect() {
        this.connected = false;
        observers.delete(this.callback);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

it('피드 끝 지점이 보이면 더 보기 버튼 없이 다음 글을 불러오고 진행 상태를 알려야 한다', async () => {
  const first: PostList = { items: [post('first', '첫 번째 글')], nextCursor: 'page-2' };
  const next = Promise.withResolvers<PostList>();
  io.listPosts.mockImplementation(async (params) => (params?.cursor === 'page-2' ? next.promise : first));
  const view = mount(snapshot(first));
  try {
    expect(await screen.findByRole('heading', { name: '첫 번째 글' })).toBeTruthy();
    await act(async () => {});
    expect(io.listPosts.mock.calls.some(([params]) => params?.cursor)).toBe(false);
    act(() => {
      viewport.endVisible = true;
      observers.forEach(notify);
    });
    expect(await screen.findByText('게시글 불러오는 중')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '더 많은 글 보기' })).toBeNull();
    await act(async () => next.resolve({ items: [post('second', '두 번째 글')], nextCursor: null }));
    expect(await screen.findByRole('heading', { name: '두 번째 글' })).toBeTruthy();
    expect(screen.getByText('여기까지, 모든 플레이 이야기를 만났어요')).toBeTruthy();
    expect(screen.queryByText('게시글 불러오는 중')).toBeNull();
  } finally {
    view.unmount();
  }
});

it('짧은 페이지로 끝 지점이 계속 보이면 불러오기가 끝난 뒤 이어서 불러야 한다', async () => {
  viewport.endVisible = true;
  const first: PostList = { items: [post('first', '첫 번째 글')], nextCursor: 'page-2' };
  const pages: Record<string, PostList> = {
    'page-2': { items: [post('second', '두 번째 글')], nextCursor: 'page-3' },
    'page-3': { items: [post('third', '세 번째 글')], nextCursor: null },
  };
  // 실제 응답처럼 다음 작업 주기에 도착해야 불러오는 중 상태가 한 번 렌더된다.
  io.listPosts.mockImplementation(async (params) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return pages[params?.cursor ?? ''] ?? first;
  });
  const view = mount(snapshot(first));
  try {
    expect(await screen.findByRole('heading', { name: '세 번째 글' })).toBeTruthy();
    await waitFor(() =>
      expect(io.listPosts.mock.calls.flatMap(([params]) => params?.cursor ?? [])).toEqual([
        'page-2',
        'page-3',
      ]),
    );
    expect(observers.size).toBe(0);
  } finally {
    view.unmount();
  }
});
