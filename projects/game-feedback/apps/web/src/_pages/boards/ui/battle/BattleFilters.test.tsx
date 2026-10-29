import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { describe, expect, it, vi } from 'vitest';

import { BattleFilters } from './BattleFilters';

const router = {
  bfcacheId: 'board-filter-server-test',
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  hmrRefresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

/** 서버가 보낸 첫 HTML. useSyncExternalStore는 여기서 snapshot(initialSearch)만 읽는다. */
function serverHtml(children: ReactNode) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <AppRouterContext.Provider value={router}>{children}</AppRouterContext.Provider>,
  );
  return container;
}
function link(container: HTMLElement, name: string) {
  const found = [...container.querySelectorAll('a')].find((anchor) => anchor.textContent === name);
  if (!found) throw new Error(`${name} 링크가 있어야 한다`);
  return {
    current: found.getAttribute('aria-current'),
    query: new URL(found.href, 'http://local').searchParams,
  };
}

describe('board filter chips in the first HTML', () => {
  // 전투 칩은 빈 검색으로 서버 렌더해 JavaScript 전 HTML이 항상 '전체'를 표시하고 game·q를 잃었다.
  it('marks the snapshot battle mode and keeps the game and search query', () => {
    const container = serverHtml(
      <BattleFilters
        locale="ko"
        slug="friendly"
        initialSearch="?game=brawl-stars&q=battle&battleMode=TEAM"
      />,
    );
    expect(link(container, '팀전').current).toBe('page');
    expect(link(container, '전체').current).toBeNull();
    expect(Object.fromEntries(link(container, '1:1').query)).toEqual({
      game: 'brawl-stars',
      q: 'battle',
      battleMode: 'DUEL',
    });
  });
});
