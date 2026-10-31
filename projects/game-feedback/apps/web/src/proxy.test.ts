import { NextRequest } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentUnavailable } from '@/_app/seo/index.server';

import { proxy } from './proxy';

vi.mock('@/_app/seo/index.server', () => ({ documentUnavailable: vi.fn(async () => false) }));

afterEach(() => vi.mocked(documentUnavailable).mockReset());

describe('proxy URLs behind the production reverse proxy', () => {
  it('redirects the root to the public HTTPS origin without the internal web port', async () => {
    const response = await proxy(
      new NextRequest('https://0.0.0.0:3300/?q=deck&tab=latest&next=https://other.example', {
        headers: { host: 'game.bambyul.com', 'accept-language': 'ko-KR' },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://game.bambyul.com/ko?q=deck&tab=latest');
  });

  it.each([
    ['http://0.0.0.0:3300/', 'localhost:3300', 'http://localhost:3300/en'],
    ['https://0.0.0.0:3300/', 'game.example:8443', 'https://game.example:8443/en'],
    ['https://0.0.0.0:3300/', 'game.example:443', 'https://game.example/en'],
  ])('preserves the public host port for %s with Host %s', async (url, host, location) => {
    const response = await proxy(new NextRequest(url, { headers: { host } }));

    expect(response.headers.get('location')).toBe(location);
  });

  it('keeps the direct request origin when no Host header is supplied', async () => {
    const response = await proxy(new NextRequest('http://localhost:3300/'));

    expect(response.headers.get('location')).toBe('http://localhost:3300/en');
  });

  it('rewrites an unavailable document without leaking the internal web port', async () => {
    vi.mocked(documentUnavailable).mockResolvedValueOnce(true);
    const response = await proxy(
      new NextRequest('https://0.0.0.0:3300/ko/posts/private-post?game=clash-royale', {
        headers: { host: 'game.bambyul.com' },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://game.bambyul.com/unavailable');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
