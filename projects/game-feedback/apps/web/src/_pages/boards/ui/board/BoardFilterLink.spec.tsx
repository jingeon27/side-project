import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardFilterLink } from './BoardFilterLink';

const router = {
  bfcacheId: 'board-filter-link-test',
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  hmrRefresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

describe('게시판 필터 칩', () => {
  it('공통 Button의 알약 모양으로 고른 칩은 주황, 나머지는 테두리가 보이는 칩이어야 한다', () => {
    render(
      <AppRouterContext.Provider value={router}>
        <BoardFilterLink href="/ko/boards/friendly" active>
          전체
        </BoardFilterLink>
        <BoardFilterLink href="/ko/boards/friendly?battleMode=DUEL" active={false}>
          1:1
        </BoardFilterLink>
      </AppRouterContext.Provider>,
    );
    const current = screen.getByRole('link', { name: '전체' });
    const other = screen.getByRole('link', { name: '1:1' });
    for (const chip of [current, other]) {
      expect([...chip.classList]).toEqual(expect.arrayContaining(['h-9', 'rounded-full']));
      expect([...chip.classList]).not.toContain('rounded-control');
    }
    expect(current.getAttribute('aria-current')).toBe('page');
    expect([...current.classList]).toEqual(expect.arrayContaining(['bg-accent', 'text-on-accent']));
    // buttonVariants는 기본 border-transparent와 secondary의 border-line-strong을 함께 내고, 생성 CSS에서는
    // border-transparent가 뒤에 나온다. cn으로 합치지 않으면 고르지 않은 칩의 테두리가 사라진다.
    expect(other.hasAttribute('aria-current')).toBe(false);
    expect([...other.classList]).toEqual(expect.arrayContaining(['bg-surface', 'border-line-strong']));
    expect([...other.classList]).not.toContain('border-transparent');
  });
});
