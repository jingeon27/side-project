import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentUnavailable } from '@/_app/seo/document-access.server';
import { PUBLIC_LOOKUP_PAGES_PER_MINUTE } from '@/shared/api/visitor-rate-limit';

import { config, proxy } from './proxy';

vi.mock('@/_app/seo/document-access.server', () => ({ documentUnavailable: vi.fn(async () => false) }));

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

// 상세 공유 이미지가 matcher 밖에 있어서 익명 주소 하나가 임의 id로 공유 내부 조회 예산을 비울 수 있었다.
describe('detail share images in the proxy', () => {
  const shareImage = (path: string, visitor?: string) =>
    new NextRequest(`https://game.example${path}`, {
      headers: visitor ? { 'x-forwarded-for': `${visitor}, 10.0.0.2` } : {},
    });

  it('runs on detail share images and leaves the static share image response alone', () => {
    for (const url of ['/og/posts/post-1', '/og/users/user-1'])
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: '/og' })).toBe(false);
  });

  it('limits detail share images with the same per-visitor budget as detail documents', async () => {
    const visitor = '203.0.113.81';
    for (const index of Array.from({ length: PUBLIC_LOOKUP_PAGES_PER_MINUTE }, (_, offset) => offset))
      expect(
        (await proxy(shareImage(index % 2 ? `/og/posts/random-${index}` : `/og/users/u-${index}`, visitor)))
          .status,
      ).not.toBe(429);
    const limited = await proxy(shareImage('/og/posts/one-more', visitor));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/);
    expect(limited.headers.get('cache-control')).toBe('private, no-store');
    // 공유 이미지로 쓴 예산은 같은 방문자의 상세 문서와 함께 줄어든다.
    expect((await proxy(shareImage('/ko/posts/random-1', visitor))).status).toBe(429);
    expect((await proxy(shareImage('/og/posts/random-1', '198.51.100.81'))).status).not.toBe(429);
    expect((await proxy(shareImage('/og/posts/random-1'))).status).not.toBe(429);
  });
});
