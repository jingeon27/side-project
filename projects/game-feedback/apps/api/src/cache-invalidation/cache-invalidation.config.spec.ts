import { describe, expect, it, vi } from 'vitest';

import { resolveCacheRevalidationConfig } from './cache-invalidation.config';

vi.mock('../config/runtime-secret', () => ({ ensureRuntimeSecret: () => 'a'.repeat(64) }));

describe('cache callback configuration', () => {
  it('isolates tests and derives the local callback from WEB_ORIGIN', () => {
    expect(resolveCacheRevalidationConfig({ ENVIRONMENT: 'test' })).toBeUndefined();
    expect(resolveCacheRevalidationConfig({ WEB_ORIGIN: 'http://localhost:3300' })).toEqual({
      url: 'http://localhost:3300/internal/cache/revalidate',
      secret: 'a'.repeat(64),
    });
  });
  it('keeps production callbacks on the private service network', () => {
    expect(
      resolveCacheRevalidationConfig({ ENVIRONMENT: 'production', WEB_ORIGIN: 'https://game.example' }),
    ).toMatchObject({ url: 'http://gf-web:3300/internal/cache/revalidate' });
  });
  it.each(['file:///etc/passwd', 'https://user:password@web', 'https://web/?secret=leak'])(
    'rejects unsafe origins without printing their contents',
    (WEB_ORIGIN) => expect(() => resolveCacheRevalidationConfig({ WEB_ORIGIN })).toThrow('WEB_ORIGIN'),
  );
});
