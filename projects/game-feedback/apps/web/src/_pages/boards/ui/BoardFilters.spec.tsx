import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ReactNode } from 'react';
import { installBrowserNavigation } from '@/shared/navigation';
import { FeedbackFilters } from './FeedbackFilters';
import { CoachingFilters } from './CoachingFilters';
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

describe('고정 게시판 필터 링크', () => {
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
  it('코칭 역할의 활성 표시를 URL 변경에 맞춰 갱신해야 한다', async () => {
    mount(
      '/ko/boards/coaching?q=lesson&game=brawl-stars&coachingRole=STUDENT',
      <CoachingFilters locale="ko" slug="coaching" />,
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
  it('전투 유형 링크에서 게임과 검색어를 유지하고 잘못된 유형은 전체로 표시해야 한다', () => {
    mount(
      '/ko/boards/friendly?q=battle&game=brawl-stars&battleMode=invalid',
      <BattleFilters locale="ko" slug="friendly" />,
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
