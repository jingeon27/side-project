import type { ReactNode } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installBrowserNavigation } from '@/shared/navigation';

import { BattleFilters } from './BattleFilters';

const router = {
  bfcacheId: 'board-filter-test',
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  hmrRefresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};
const state = { stop: () => {} };
const mount = (path: string, children: ReactNode) => {
  window.history.replaceState({}, '', path);
  state.stop = installBrowserNavigation();
  return render(<AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>);
};
const hrefOf = (name: string) => {
  const href = screen.getByRole('link', { name }).getAttribute('href');
  if (!href) throw new Error('필터 링크가 있어야 한다');
  return new URL(href, window.location.origin);
};
afterEach(() => state.stop());

describe('전투 유형 필터 링크', () => {
  it('전투 유형 링크에서 게임과 검색어를 유지하고 잘못된 유형은 전체로 표시해야 한다', () => {
    mount(
      '/ko/boards/friendly?q=battle&game=brawl-stars&battleMode=invalid',
      <BattleFilters locale="ko" slug="friendly" initialSearch="" />,
    );
    expect(screen.getByRole('link', { name: '전체' }).getAttribute('aria-current')).toBe('page');
    expect(Object.fromEntries(hrefOf('1:1').searchParams)).toEqual({
      q: 'battle',
      game: 'brawl-stars',
      battleMode: 'DUEL',
    });
    expect(Object.fromEntries(hrefOf('팀전').searchParams)).toEqual({
      q: 'battle',
      game: 'brawl-stars',
      battleMode: 'TEAM',
    });
  });
});
