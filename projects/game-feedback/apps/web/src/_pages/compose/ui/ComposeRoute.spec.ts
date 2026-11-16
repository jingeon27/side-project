import { isValidElement, type ComponentProps } from 'react';

import { beforeEach, expect, it, vi } from 'vitest';

import { getPublicCategories } from '@/features/category/index.server';

import { ComposeRoute } from './ComposeRoute';
import type { PostComposePage } from './PostComposePage';

vi.mock('@/features/category/index.server', () => ({ getPublicCategories: vi.fn() }));

beforeEach(() => {
  vi.mocked(getPublicCategories)
    .mockReset()
    .mockResolvedValue([
      { id: 'royale', slug: 'clash-royale', name: '클래시로얄', active: true },
      { id: 'brawl', slug: 'brawl-stars', name: '브롤스타즈', active: true },
      { id: 'retired', slug: 'retired', name: '중단한 게임', active: false },
    ]);
});

it.each([
  { board: 'missing' },
  { board: ['friendly'] },
  { game: ['clash-royale'] },
  { board: 'free', battleMode: 'TEAM' },
  { board: 'friendly', coachingRole: 'COACH' },
  { coachingRole: 'STUDENT' },
])('잘못된 작성 문맥 %j는 분류 조회 전에 404로 거부해야 한다', async (input) => {
  await expect(ComposeRoute({ locale: 'ko', ...input })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(getPublicCategories).not.toHaveBeenCalled();
});

it.each([
  [{}, 'FEEDBACK', undefined, '/ko'],
  [{ game: 'brawl-stars' }, 'FEEDBACK', 'brawl', '/ko'],
  [
    { board: 'friendly', game: 'brawl-stars', battleMode: 'TEAM' },
    'FRIENDLY',
    'brawl',
    '/ko/boards/friendly?game=brawl-stars&battleMode=TEAM',
  ],
  [
    { board: 'coaching', coachingRole: 'STUDENT' },
    'COACHING',
    'royale',
    '/ko/boards/coaching?coachingRole=STUDENT',
  ],
] as const)('작성 기본값과 상위 경로를 보존해야 한다: %j', async (input, board, categoryId, parent) => {
  const element = await ComposeRoute({ locale: 'ko', ...input });
  const child: unknown = element.props.children;
  if (!isValidElement<ComponentProps<typeof PostComposePage>>(child))
    throw new Error('작성 화면이 필요합니다.');
  expect(child.props).toMatchObject({ board, categoryId, parent });
  expect(child.props.categories.map((category) => category.slug)).toEqual(['clash-royale', 'brawl-stars']);
  expect(getPublicCategories).toHaveBeenCalledTimes(1);
});

it.each(['retired', 'unknown-game'])(
  '비활성·없는 게임 %s를 기본 게임으로 바꾸지 않아야 한다',
  async (game) => {
    await expect(ComposeRoute({ locale: 'ko', game })).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  },
);
