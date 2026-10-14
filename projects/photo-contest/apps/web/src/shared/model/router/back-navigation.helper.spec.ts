import { describe, expect, it } from 'vitest';

import { resolveBackAction } from './back-navigation.helper';

describe('resolveBackAction', () => {
  it('열린 오버레이가 있으면 화면보다 오버레이를 먼저 닫아야 한다', () => {
    expect(
      resolveBackAction({ hasOverlay: true, depth: 3, pathname: '/contests/c1', parentHref: null }),
    ).toEqual({
      type: 'close-overlay',
    });
  });

  it('앱 안 기록이 있으면 이전 화면으로 돌아가야 한다', () => {
    expect(resolveBackAction({ hasOverlay: false, depth: 1, pathname: '/', parentHref: null })).toEqual({
      type: 'history-back',
    });
  });

  it('기록 없이 바로 들어온 화면은 상위 화면으로 replace해야 한다', () => {
    expect(
      resolveBackAction({ hasOverlay: false, depth: 0, pathname: '/contests/c1', parentHref: '/groups/g1' }),
    ).toEqual({ type: 'replace', href: '/groups/g1' });
    expect(
      resolveBackAction({ hasOverlay: false, depth: 0, pathname: '/invite/t1', parentHref: null }),
    ).toEqual({
      type: 'replace',
      href: '/',
    });
  });

  it('기록 없는 홈에서는 앱이 기본 동작을 하도록 넘겨야 한다', () => {
    expect(resolveBackAction({ hasOverlay: false, depth: 0, pathname: '/', parentHref: null })).toEqual({
      type: 'exit',
    });
  });
});
