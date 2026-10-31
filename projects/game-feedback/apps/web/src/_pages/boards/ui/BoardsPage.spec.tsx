import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { TBoardKind } from '@game-feedback/contracts';

import { sessionOptions, SessionProvider } from '@/features/auth';
import type { TPostListParams } from '@/features/post';
import type { Post, PostList } from '@/shared/api';
import { MotionProvider } from '@/shared/motion';

import type { IBoardPageProps } from '../model/board-page.type';
import type { IBoardSnapshot } from '../model/board-snapshot.type';
import { BattleBoard } from './battle/BattleBoard';
import { CoachingBoard } from './coaching/CoachingBoard';
import { FeedbackBoard } from './feedback/FeedbackBoard';
import { FreeBoard } from './free/FreeBoard';
import { FriendSaleBoard } from './friend-sale/FriendSaleBoard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const io = vi.hoisted(() => ({ listPosts: vi.fn<(params?: TPostListParams) => Promise<PostList>>() }));
vi.mock('@game-feedback/sdk', async (original) => ({
  ...(await original<typeof import('@game-feedback/sdk')>()),
  listPosts: io.listPosts,
  getSession: async () => ({
    user: null,
    demoMode: false,
    googleConfigured: false,
    needsOnboarding: false,
  }),
}));

const category = { id: 'game', slug: 'clash-royale', name: '클래시로얄', active: true };
const fixture = (board: TBoardKind): IBoardSnapshot => ({
  game: category,
  q: '',
  posts: {
    nextCursor: 'next-page',
    items: [
      {
        id: 'first-post',
        title: '게시판 본문 확인',
        body: '서버에서 받은 게시물 내용입니다.',
        board,
        categoryId: category.id,
        category,
        author: {
          id: 'author',
          nickname: '작성자',
          isVerified: true,
          supercellTag: null,
          isTestAccount: false,
        },
        gameProfile: null,
        viewCount: 7,
        answerCount: 2,
        helpfulCount: 1,
        createdAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
        updatedAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
        battle: board === 'FRIENDLY' ? { mode: 'TEAM' } : null,
        coaching: board === 'COACHING' ? { role: 'COACH', pricing: { type: 'HOURLY', amount: 30000 } } : null,
        friendSale: board === 'FRIEND_SALE' ? { price: 15000 } : null,
      } satisfies Post,
    ],
  },
});

const mountBoard = (Board: ComponentType<IBoardPageProps>, initialBoard: IBoardSnapshot) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionOptions().queryKey, {
    user: null,
    demoMode: false,
    googleConfigured: false,
    needsOnboarding: false,
  });
  return {
    client,
    element: (
      <QueryClientProvider client={client}>
        <SessionProvider onLogin={vi.fn()}>
          <MotionProvider>
            <Board locale="ko" initialBoard={initialBoard} />
          </MotionProvider>
        </SessionProvider>
      </QueryClientProvider>
    ),
  };
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  [FeedbackBoard, 'FEEDBACK', '피드백', '답변 상태'],
  [BattleBoard, 'FRIENDLY', '전투 모집', '전투 유형'],
  [CoachingBoard, 'COACHING', '게임코치', '모집 유형'],
  [FriendSaleBoard, 'FRIEND_SALE', '친추판매', null],
  [FreeBoard, 'FREE', '자유게시판', null],
] as const)(
  '%s는 자기 게시판의 작성 행동·필터·카드를 서버 HTML에 조립해야 한다',
  (Board, kind, title, filter) => {
    const { client, element } = mountBoard(Board, fixture(kind));
    try {
      const html = renderToString(element);
      expect(html).toContain(`<h1>${title}</h1>`);
      expect(html).toContain(kind === 'COACHING' ? '코칭 등록' : '글쓰기');
      expect(html).toContain('게시판 본문 확인');
      expect(html).toContain('서버에서 받은 게시물 내용입니다.');
      expect(html).toContain('작성자');
      expect(html).toContain('조회 7');
      expect(html).toContain(`data-board="${kind}"`);
      for (const label of ['답변 상태', '전투 유형', '모집 유형']) {
        expect(html.includes(`aria-label="${label}"`)).toBe(label === filter);
      }
    } finally {
      client.clear();
    }
  },
);

it('공유 목록은 게시판 필터와 첫 페이지를 유지하면서 다음 페이지를 이어 붙여야 한다', async () => {
  const initial = { ...fixture('FRIENDLY'), battleMode: 'TEAM' as const };
  const first = initial.posts.items[0];
  if (!first) throw new Error('첫 페이지 fixture가 필요합니다.');
  const second: Post = { ...first, id: 'second-post', title: '두 번째 게시물' };
  io.listPosts.mockImplementation(async (params) =>
    params?.cursor ? { items: [second], nextCursor: null } : initial.posts,
  );
  const { client, element } = mountBoard(BattleBoard, initial);
  const view = render(element);
  try {
    expect(await screen.findByRole('heading', { name: '게시판 본문 확인' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByRole('heading', { name: '두 번째 게시물' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '게시판 본문 확인' })).toBeTruthy();
    expect(
      io.listPosts.mock.calls.some(
        ([params]) =>
          params?.board === 'FRIENDLY' && params.battleMode === 'TEAM' && params.cursor === 'next-page',
      ),
    ).toBe(true);
  } finally {
    view.unmount();
    client.clear();
  }
});
