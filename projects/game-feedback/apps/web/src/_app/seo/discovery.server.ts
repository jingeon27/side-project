import 'server-only';

import type { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';

import { appRoutes } from '@game-feedback/bridge';
import { DISCOVERY_CACHE_TAG, LEGAL_POLICY_VERSION } from '@game-feedback/contracts';

import { gameBoards } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
import { getPublicPostList } from '@/features/post/index.server';
import { isAtOrBefore } from '@/shared/lib/date';
import { getSeoConfig, pageUrl } from '@/shared/seo';

type TSitemapEntries = Map<string, { url: string; lastModified?: string }>;

const boardKey = (gameSlug: string, boardKind: string) => `${gameSlug}:${boardKind}`;

/** 목록과 프로필은 그 안의 글이 바뀔 때 함께 바뀌므로 글 중 가장 늦은 수정 시각을 남긴다. */
function touchEntry(entries: TSitemapEntries, url: string, updatedAt: string) {
  const current = entries.get(url)?.lastModified;
  if (!current || isAtOrBefore(current, updatedAt)) entries.set(url, { url, lastModified: updatedAt });
}

export function robots(): MetadataRoute.Robots {
  const { indexable, origin } = getSeoConfig();
  if (!indexable) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/app-auth/', '/*/messages', '/*/notifications', '/*/settings'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
export async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!getSeoConfig().indexable) return [];
  const entries: TSitemapEntries = new Map();
  // 소개·가이드·문의는 수정일 기록이 없어 lastmod를 만들지 않는다.
  entries.set(pageUrl('/about'), { url: pageUrl('/about') });
  entries.set(pageUrl('/ko'), { url: pageUrl('/ko') });
  ['ko', 'en', 'ja'].forEach((locale) => {
    ['/guide', '/contact'].forEach((path) => {
      const url = pageUrl(`/${locale}${path}`);
      entries.set(url, { url });
    });
    // 약관과 개인정보 처리방침은 화면에 표시하는 시행일이 곧 마지막 개정일이다.
    ['/terms', '/privacy'].forEach((path) => {
      const url = pageUrl(`/${locale}${path}`);
      entries.set(url, { url, lastModified: LEGAL_POLICY_VERSION });
    });
  });
  const boardUrls = new Map<string, string>();
  (await getPublicCategories())
    .filter((item) => item.active)
    .forEach((game) => {
      gameBoards.forEach((board) => {
        const url = pageUrl(appRoutes.boards('ko', board.slug, undefined, game.slug));
        entries.set(url, { url });
        boardUrls.set(boardKey(game.slug, board.kind), url);
      });
    });
  return collectPosts(entries, boardUrls, new Set<string>());
}
async function collectPosts(
  entries: TSitemapEntries,
  boardUrls: ReadonlyMap<string, string>,
  cursors: Set<string>,
  cursor?: string,
  page = 0,
): Promise<MetadataRoute.Sitemap> {
  if (page >= 500) throw new Error('Sitemap requires partitioning before exceeding the supported URL count.');
  const result = await getPublicPostList(cursor);
  result.items
    .filter((post) => !post.author.isTestAccount)
    .forEach((post) => {
      const url = pageUrl(`/ko/posts/${encodeURIComponent(post.id)}`);
      entries.set(url, { url, lastModified: post.updatedAt });
      touchEntry(entries, pageUrl(`/ko/users/${encodeURIComponent(post.author.id)}`), post.updatedAt);
      touchEntry(entries, pageUrl('/ko'), post.updatedAt);
      // 비활성 게임이나 폐지한 게시판의 글이 사이트맵에 없는 목록 URL을 새로 만들지 않게 한다.
      const boardUrl = boardUrls.get(boardKey(post.category.slug, post.board ?? 'FEEDBACK'));
      if (boardUrl) touchEntry(entries, boardUrl, post.updatedAt);
    });
  if (entries.size > 50_000) throw new Error('Sitemap requires partitioning.');
  if (!result.nextCursor) return [...entries.values()];
  if (cursors.has(result.nextCursor)) throw new Error('Sitemap pagination did not advance.');
  cursors.add(result.nextCursor);
  return collectPosts(entries, boardUrls, cursors, result.nextCursor, page + 1);
}
export async function dailySitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheTag(DISCOVERY_CACHE_TAG);
  cacheLife({ stale: 86_400, revalidate: 86_400, expire: 172_800 });
  return sitemap();
}
