import { NextRequest } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentUnavailable } from '@/_app/seo/index.server';
import { PUBLIC_LOOKUP_PAGES_PER_MINUTE } from '@/shared/api/visitor-rate-limit';

import { proxy } from './proxy';

vi.mock('@/_app/seo/index.server', () => ({ documentUnavailable: vi.fn(async () => false) }));

function request(path: string, visitor?: string, rsc = false) {
  return new NextRequest(`https://game.example${path}`, {
    headers: {
      ...(visitor ? { 'x-forwarded-for': `${visitor}, 10.0.0.2` } : {}),
      ...(rsc ? { rsc: '1' } : {}),
    },
  });
}
afterEach(() => vi.mocked(documentUnavailable).mockClear());

describe('public lookup pages in the proxy', () => {
  it('limits post and profile documents and RSC requests per visitor before the shared cache', async () => {
    const visitor = '203.0.113.71';
    for (const index of Array.from({ length: PUBLIC_LOOKUP_PAGES_PER_MINUTE }, (_, offset) => offset))
      expect(
        (
          await proxy(
            request(
              index % 2 ? `/ko/posts/random-${index}` : `/en/users/u-${index}`,
              visitor,
              index % 3 === 0,
            ),
          )
        ).status,
      ).not.toBe(429);
    const limited = await proxy(request('/ja/posts/one-more', visitor, true));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/);
    expect(limited.headers.get('cache-control')).toBe('private, no-store');
    // Other visitors, other pages and direct local requests keep working.
    expect((await proxy(request('/ko/posts/random-1', '198.51.100.72'))).status).not.toBe(429);
    expect((await proxy(request('/ko/boards/free', visitor))).status).not.toBe(429);
    expect((await proxy(request('/ko/posts/random-1'))).status).not.toBe(429);
  });

  it('passes the visitor address to the document access lookups', async () => {
    await proxy(request('/ko/posts/visitor-check', '203.0.113.73'));
    expect(documentUnavailable).toHaveBeenCalledWith(
      '/ko/posts/visitor-check',
      undefined,
      [],
      '203.0.113.73',
    );
    await proxy(request('/ko/posts/visitor-check'));
    expect(documentUnavailable).toHaveBeenLastCalledWith('/ko/posts/visitor-check', undefined, [], null);
  });
});
