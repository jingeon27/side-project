import 'server-only';
import type { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';
import { DISCOVERY_CACHE_TAG } from '@game-feedback/contracts';
import { getPublicPostList } from '@/features/post/index.server';
import { getSeoConfig, pageUrl } from '@/shared/seo';
import { getPublicCategories } from '@/features/category/index.server';
import { appRoutes } from '@game-feedback/bridge';
import { gameBoards } from '@/features/board';
export function robots(): MetadataRoute.Robots {
  const { indexable, origin } = getSeoConfig();
  if (!indexable) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/messages', '/*/notifications', '/*/settings'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
export async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!getSeoConfig().indexable) return [];
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  entries.set(pageUrl('/ko'), { url: pageUrl('/ko') });
  ['ko', 'en', 'ja'].forEach((locale) => {
    ['/guide', '/terms', '/privacy', '/contact'].forEach((path) => {
      const url = pageUrl(`/${locale}${path}`);
      entries.set(url, { url });
    });
  });
  (await getPublicCategories())
    .filter((item) => item.active)
    .forEach((game) => {
      gameBoards.forEach((board) => {
        const url = pageUrl(appRoutes.boards('ko', board.slug, undefined, game.slug));
        entries.set(url, { url });
      });
    });
  return collectPosts(entries, new Set<string>());
}
async function collectPosts(
  entries: Map<string, MetadataRoute.Sitemap[number]>,
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
      const authorUrl = pageUrl(`/ko/users/${encodeURIComponent(post.author.id)}`);
      entries.set(authorUrl, { url: authorUrl });
    });
  if (entries.size > 50_000) throw new Error('Sitemap requires partitioning.');
  if (!result.nextCursor) return [...entries.values()];
  if (cursors.has(result.nextCursor)) throw new Error('Sitemap pagination did not advance.');
  cursors.add(result.nextCursor);
  return collectPosts(entries, cursors, result.nextCursor, page + 1);
}
export async function dailySitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheTag(DISCOVERY_CACHE_TAG);
  cacheLife({ stale: 86_400, revalidate: 86_400, expire: 172_800 });
  return sitemap();
}
