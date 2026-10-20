import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_CACHE_TAG,
  PUBLIC_CONTENT_TTL,
  PUBLIC_SITEMAP_TTL,
  publicCacheOptions,
  publicPreloadContext,
} from './public-cache.policy';

describe('공개 서버 캐시 정책', () => {
  it('공개 query만 정해진 재검증 주기와 공통 무효화 태그를 사용해야 한다', () => {
    const query = parse('query { publicGroupCount }');
    expect(publicCacheOptions(query, PUBLIC_CONTENT_TTL)).toEqual({
      cache: 'force-cache',
      next: { revalidate: 30, tags: [PUBLIC_CACHE_TAG] },
    });
    expect(publicCacheOptions(query, PUBLIC_SITEMAP_TTL).next.revalidate).toBe(60);
  });
  it('공개 사전 조회에만 익명 캐시 문맥을 지정해야 한다', () => {
    expect(publicPreloadContext(parse('query {publicGalleryPosts(sort:NEWEST){id}}'))).toEqual({
      headers: { 'x-photo-contest-public-query': 'true' },
      fetchOptions: { cache: 'force-cache', next: { revalidate: 30, tags: [PUBLIC_CACHE_TAG] } },
    });
  });
  it('쓰기·구독·모호한 문서는 서버 캐시에 넣지 못해야 한다', () => {
    for (const source of [
      'mutation { logout }',
      'subscription { changes }',
      'query A { me { id } } query B { me { id } }',
    ])
      expect(() => publicCacheOptions(parse(source), PUBLIC_CONTENT_TTL)).toThrow('query 문서');
  });
});
