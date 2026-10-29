import type { ReactNode } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installBrowserNavigation } from '@/shared/navigation';

import { CoachingFilters } from './CoachingFilters';

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

describe('모집 유형 필터 링크', () => {
  it('코칭 역할의 활성 표시를 URL 변경에 맞춰 갱신해야 한다', async () => {
    mount(
      '/ko/boards/coaching?q=lesson&game=brawl-stars&coachingRole=STUDENT',
      <CoachingFilters locale="ko" slug="coaching" initialSearch="" />,
    );
    expect(screen.getByRole('link', { name: '코치 구함' }).getAttribute('aria-current')).toBe('page');
    const coach = hrefOf('수강생 모집');
    expect(Object.fromEntries(coach.searchParams)).toEqual({
      q: 'lesson',
      game: 'brawl-stars',
      coachingRole: 'COACH',
    });
    await act(async () => window.history.replaceState({}, '', coach));
    expect(screen.getByRole('link', { name: '수강생 모집' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '코치 구함' }).hasAttribute('aria-current')).toBe(false);
  });
});
