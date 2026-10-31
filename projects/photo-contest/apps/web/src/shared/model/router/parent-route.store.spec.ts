import { describe, expect, it } from 'vitest';

import { getParentRoute, registerParentRoute } from './parent-route.store';

describe('parent route', () => {
  it('등록하지 않은 화면의 상위는 홈이고 홈의 상위는 없어야 한다', () => {
    expect(getParentRoute('/groups/g1')).toBe('/');
    expect(getParentRoute('/about')).toBeNull();
    expect(getParentRoute('/')).toBeNull();
    expect(getParentRoute('/about/how-it-works')).toBe('/about');
  });

  it('화면이 등록한 상위 화면은 그 경로에서만 쓰고 해제하면 지워야 한다', () => {
    const release = registerParentRoute('/contests/c1', '/groups/g1');
    expect(getParentRoute('/contests/c1')).toBe('/groups/g1');
    expect(getParentRoute('/contests/c2')).toBe('/');
    release();
    expect(getParentRoute('/contests/c1')).toBe('/');
  });
});
