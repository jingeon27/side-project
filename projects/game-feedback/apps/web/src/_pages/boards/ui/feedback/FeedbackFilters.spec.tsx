import type { ReactNode } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installBrowserNavigation } from '@/shared/navigation';

import { FeedbackFilters } from './FeedbackFilters';

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

describe('답변 상태 필터 링크', () => {
  it('피드백 상태를 바꿔도 검색어와 게임 문맥을 유지하고 전체는 상태만 해제해야 한다', () => {
    mount(
      '/ko/boards/feedback?q=hog&game=brawl-stars&feedbackStatus=WAITING',
      <FeedbackFilters locale="ko" initialSearch="" />,
    );
    expect(screen.getByRole('link', { name: '답변 대기' }).getAttribute('aria-current')).toBe('page');
    const answered = hrefOf('답변 있음');
    expect(answered.pathname).toBe('/ko/boards/feedback');
    expect(Object.fromEntries(answered.searchParams)).toEqual({
      q: 'hog',
      game: 'brawl-stars',
      feedbackStatus: 'ANSWERED',
    });
    expect(Object.fromEntries(hrefOf('전체').searchParams)).toEqual({ q: 'hog', game: 'brawl-stars' });
  });
});
