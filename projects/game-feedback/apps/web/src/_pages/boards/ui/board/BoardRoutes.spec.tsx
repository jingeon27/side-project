import type { ReactElement } from 'react';

import { beforeEach, expect, it, vi } from 'vitest';

import type { IBoardPageProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import type { IBoardSnapshot } from '../../model/board-snapshot.type';
import { BattleBoard } from '../battle/BattleBoard';
import { BattleBoardRoute } from '../battle/BattleBoardRoute';
import { CoachingBoard } from '../coaching/CoachingBoard';
import { CoachingBoardRoute } from '../coaching/CoachingBoardRoute';
import { FeedbackBoard } from '../feedback/FeedbackBoard';
import { FeedbackBoardRoute } from '../feedback/FeedbackBoardRoute';
import { FreeBoard } from '../free/FreeBoard';
import { FreeBoardRoute } from '../free/FreeBoardRoute';
import { FriendSaleBoard } from '../friend-sale/FriendSaleBoard';
import { FriendSaleBoardRoute } from '../friend-sale/FriendSaleBoardRoute';

vi.mock('../../model/board-route.server', () => ({ boardSnapshot: vi.fn() }));

const snapshot: IBoardSnapshot = {
  game: { id: 'game', slug: 'clash-royale', name: '클래시로얄', active: true },
  q: '',
  posts: { items: [], nextCursor: null },
};
const searchParams = Promise.resolve({});
type TFrame = ReactElement<IBoardPageProps & { slug: string; children: ReactElement<IBoardPageProps> }>;

const routes = [
  ['feedback', FeedbackBoardRoute, FeedbackBoard],
  ['friendly', BattleBoardRoute, BattleBoard],
  ['coaching', CoachingBoardRoute, CoachingBoard],
  ['friend-sale', FriendSaleBoardRoute, FriendSaleBoard],
  ['free', FreeBoardRoute, FreeBoard],
] as const;

beforeEach(() => {
  vi.mocked(boardSnapshot).mockReset().mockResolvedValue(snapshot);
});

it.each(routes)('%s 라우트는 자기 조회 결과로 자기 게시판을 선언해야 한다', async (slug, Route, Board) => {
  const frame = (await Route({ locale: 'ko', searchParams, blockUntilReady: true })) as TFrame;

  expect(boardSnapshot).toHaveBeenCalledWith(slug, searchParams);
  expect(frame.props).toMatchObject({ locale: 'ko', slug, initialBoard: snapshot });
  expect(frame.props.children.type).toBe(Board);
  expect(frame.props.children.props).toEqual({ locale: 'ko', initialBoard: snapshot });
});

// async 함수가 Promise를 그대로 반환하면 기다려 버려 이동 중 목록 스트리밍이 사라진다.
it.each(routes)(
  '%s 라우트는 클라이언트 이동에서 조회를 기다리지 않아야 한다',
  async (_slug, Route, Board) => {
    vi.mocked(boardSnapshot).mockReturnValue(new Promise(() => undefined));

    const frame = (await Route({ locale: 'ko', searchParams, blockUntilReady: false })) as TFrame;

    expect(frame.props.initialBoard).toBeInstanceOf(Promise);
    expect(frame.props.children.type).toBe(Board);
    expect(frame.props.children.props.initialBoard).toBe(frame.props.initialBoard);
  },
);
