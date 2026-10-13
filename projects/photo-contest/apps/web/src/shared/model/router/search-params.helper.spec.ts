// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { replaceSearchParams } from './search-params.helper';

describe('replaceSearchParams', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('기록을 쌓지 않고 쿼리만 바꾸며 null 값은 지워야 한다', () => {
    window.history.replaceState(null, '', '/contests/c1?sort=latest&page=2#photos');
    const length = window.history.length;
    replaceSearchParams({ sort: 'popular', page: null });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/contests/c1?sort=popular#photos',
    );
    expect(window.history.length).toBe(length);
  });

  it('열린 오버레이의 history 표시는 지우지 않아야 한다', () => {
    window.history.replaceState({ __photoContestOverlay: 'k1', other: 1 }, '', '/contests/c1');
    replaceSearchParams({ sort: 'popular' });
    expect(window.history.state).toEqual({ __photoContestOverlay: 'k1' });
  });
});
