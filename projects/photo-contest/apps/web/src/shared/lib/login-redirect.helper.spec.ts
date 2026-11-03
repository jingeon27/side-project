import { describe, expect, it } from 'vitest';

import { buildLoginRedirectPath, getSafeNextPath } from './login-redirect.helper';

describe('getSafeNextPath', () => {
  it('같은 origin의 상대 경로만 그대로 돌려줘야 한다', () => {
    expect(getSafeNextPath('/contests/c1?sort=popular')).toBe('/contests/c1?sort=popular');
    expect(buildLoginRedirectPath('/me')).toBe('/sign?next=%2Fme');
  });

  it('다른 origin으로 새거나 형식이 이상한 값은 홈으로 바꿔야 한다', () => {
    for (const value of [
      null,
      '',
      '/sign?next=%2Fme',
      '/login',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'groups/1',
      '/groups/1\nSet-Cookie: x',
      `/${'a'.repeat(2048)}`,
    ])
      expect(getSafeNextPath(value)).toBe('/');
  });
});
