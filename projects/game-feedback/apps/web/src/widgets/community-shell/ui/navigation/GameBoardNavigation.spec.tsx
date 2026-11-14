import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { gameBoardPath } from '@/features/board';
import { categoryOptions } from '@/features/category';

import { GameBoardNavigation } from './GameBoardNavigation';

// 스크롤로 숨기기와 고른 칩 스크롤은 칩 모양과 관계없고 jsdom에는 ResizeObserver가 없다.
vi.mock('@side/design-system/lib/use-scroll-visibility', () => ({
  useScrollVisibility: () => ({ ref: () => undefined, hidden: false }),
}));
vi.mock('../../model/use-current-chip-scroll', () => ({ useCurrentChipScroll: () => () => undefined }));

const router = {
  bfcacheId: 'game-board-navigation-test',
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  hmrRefresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

function renderChips(path: string) {
  const client = new QueryClient();
  client.setQueryData(categoryOptions().queryKey, [
    { id: 'clash-royale', slug: 'clash-royale', name: '클래시 로얄', active: true },
  ]);
  render(
    <QueryClientProvider client={client}>
      <AppRouterContext.Provider value={router}>
        <GameBoardNavigation locale="ko" path={path} />
      </AppRouterContext.Provider>
    </QueryClientProvider>,
  );
  return within(screen.getByRole('navigation', { name: '클래시 로얄 게시판' })).getAllByRole('link');
}

describe('게임 게시판 칩', () => {
  it.each([
    ['전체', '/ko'],
    ['자유게시판', gameBoardPath('ko', 'FREE', 'clash-royale')],
  ])('%s 칩만 주황이고 모든 칩이 공통 Button의 알약 모양이어야 한다', (name, path) => {
    const chips = renderChips(path);
    const current = chips.filter((chip) => chip.getAttribute('aria-current') === 'page');
    expect(chips).toHaveLength(6);
    expect(current.map((chip) => chip.textContent)).toEqual([name]);
    for (const chip of chips) {
      expect([...chip.classList]).toEqual(expect.arrayContaining(['h-9', 'rounded-full']));
      expect([...chip.classList]).not.toContain('rounded-control');
    }
    for (const chip of current) {
      expect([...chip.classList]).toEqual(expect.arrayContaining(['bg-accent', 'text-on-accent']));
    }
    // 생성 CSS에서는 기본 border-transparent가 secondary의 border-line-strong보다 뒤에 나온다.
    // cn으로 합치지 않으면 고르지 않은 칩의 테두리가 사라진다.
    for (const chip of chips.filter((chip) => !current.includes(chip))) {
      expect([...chip.classList]).toEqual(expect.arrayContaining(['bg-surface', 'border-line-strong']));
      expect([...chip.classList]).not.toContain('border-transparent');
    }
  });
});
