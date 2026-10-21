import { describe, expect, it } from 'vitest';

import { resolveCacheRevalidationConfig } from './cache-invalidation.config';

const configured = {
  GF_CACHE_REVALIDATION_SECRET: 'cache-test-secret-'.repeat(3),
  GF_CACHE_REVALIDATION_URL: 'http://web:3300/_internal/cache/revalidate',
};
describe('cache callback configuration', () => {
  it('permits an unconfigured isolated test API and a configured private container callback', () => {
    expect(resolveCacheRevalidationConfig({ NODE_ENV: 'test' })).toBeUndefined();
    expect(resolveCacheRevalidationConfig(configured)).toEqual({
      url: configured.GF_CACHE_REVALIDATION_URL,
      secret: configured.GF_CACHE_REVALIDATION_SECRET,
    });
  });
  it.each([
    { NODE_ENV: 'production' },
    { ...configured, GF_CACHE_REVALIDATION_SECRET: 'short' },
    { ...configured, GF_CACHE_REVALIDATION_URL: 'file:///etc/passwd' },
    { ...configured, GF_CACHE_REVALIDATION_URL: 'http://user:password@web/_internal/cache/revalidate' },
    { ...configured, GF_CACHE_REVALIDATION_URL: 'http://web/_internal/cache/revalidate?secret=leak' },
    { ...configured, GF_CACHE_REVALIDATION_URL: 'http://web/api/posts' },
  ])('rejects incomplete or unsafe callback configuration without printing credentials', (env) => {
    expect(() => resolveCacheRevalidationConfig(env)).toThrow();
    try {
      resolveCacheRevalidationConfig(env);
    } catch (error) {
      expect(String(error)).not.toContain(configured.GF_CACHE_REVALIDATION_SECRET);
      expect(String(error)).not.toContain('user:password');
    }
  });
});
