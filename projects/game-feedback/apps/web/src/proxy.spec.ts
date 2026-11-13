import { NextRequest } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentUnavailable } from '@/_app/seo/document-access.server';
import { PUBLIC_LOOKUP_PAGES_PER_MINUTE } from '@/shared/api/visitor-rate-limit';

import { proxy } from './proxy';

vi.mock('@/_app/seo/document-access.server', () => ({ documentUnavailable: vi.fn(async () => false) }));

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
  it.each([
    '/ko/boards/free?battleMode=TEAM',
    '/ko/boards/coaching?feedbackStatus=WAITING',
    '/ko/write?board=free&coachingRole=COACH',
    '/ko/search?board=feedback&battleMode=TEAM',
    '/ko/boards/friendly?battleMode=DUEL&battleMode=TEAM',
  ])('잘못된 게시판 문맥 %s는 문서·RSC 조회 전에 404로 차단해야 한다', async (path) => {
    for (const rsc of [false, true]) {
      const response = await proxy(request(path, undefined, rsc));
      expect(response.status).toBe(404);
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('x-middleware-rewrite')).toBe('https://game.example/unavailable');
    }
    expect(documentUnavailable).not.toHaveBeenCalled();
  });

  it.each([
    '/ko/boards/friendly?battleMode=TEAM&game=brawl-stars',
    '/en/write?board=coaching&coachingRole=STUDENT',
    '/ja/search?board=feedback&feedbackStatus=WAITING&q=test',
  ])('유효한 게시판 문맥 %s는 그대로 통과시켜야 한다', async (path) => {
    expect((await proxy(request(path))).status).toBe(200);
  });

  it('루트 이동은 q·tab의 순서와 중복을 유지하고 나머지 쿼리를 버려야 한다', async () => {
    const response = await proxy(request('/?tab=unanswered&utm=mail&q=a&q=b&next=https://other.example'));
    expect(new URL(response.headers.get('location') ?? '').search).toBe('?tab=unanswered&q=a&q=b');
  });

  it('문서 판정에 같은 키로 온 게임을 모두 넘겨야 한다', async () => {
    await proxy(request('/ko/posts/post-1?game=a&game=b'));
    expect(documentUnavailable).toHaveBeenLastCalledWith('/ko/posts/post-1', undefined, ['a', 'b'], null);
  });

  it('게시판 문맥의 중복 쿼리는 문서 조회 전에 404로 막아야 한다', async () => {
    expect((await proxy(request('/ko/boards/free?game=a&game=b'))).status).toBe(404);
    expect(documentUnavailable).not.toHaveBeenCalled();
  });

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
