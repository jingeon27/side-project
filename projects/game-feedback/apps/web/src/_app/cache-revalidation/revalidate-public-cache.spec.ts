import { revalidateTag } from 'next/cache';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { revalidatePublicCache } from './revalidate-public-cache';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
const secret = 'test-only-cache-secret-'.repeat(3);
function request(body: unknown, token = secret) {
  return new Request('http://localhost/internal/cache/revalidate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv('GF_CACHE_REVALIDATION_SECRET', secret);
  vi.mocked(revalidateTag).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('authenticated cache revalidation callback', () => {
  it('expires only the requested supported tags, deduplicating repeated entries', async () => {
    const response = await revalidatePublicCache(
      request({ tags: ['post:one', 'posts', 'post:one', 'discovery'] }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenCalledWith('post:one', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('discovery', { expire: 0 });
  });
  it('rejects unauthenticated requests before consuming the request body', async () => {
    const input = request({ tags: ['posts'] }, 'wrong-secret');
    const read = vi.spyOn(input, 'text');
    expect((await revalidatePublicCache(input)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('fails closed if no server credential is configured', async () => {
    vi.stubEnv('GF_CACHE_REVALIDATION_SECRET', '');
    expect((await revalidatePublicCache(request({ tags: ['posts'] }))).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it.each([
    { tags: ['*'] },
    { tags: ['session'] },
    { tags: ['post:../other'] },
    { tags: [] },
    { tags: Array.from({ length: 65 }, () => 'posts') },
    { tags: ['posts'], url: 'https://outside.test' },
  ])('rejects unsupported or unbounded payloads: %j', async (payload) => {
    expect((await revalidatePublicCache(request(payload))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized bodies without invalidating any tag', async () => {
    for (const [body, status] of [
      ['{broken', 400],
      [' '.repeat(16_385), 413],
    ] as const) {
      const input = new Request('http://localhost/internal/cache/revalidate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        body,
      });
      expect((await revalidatePublicCache(input)).status).toBe(status);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
