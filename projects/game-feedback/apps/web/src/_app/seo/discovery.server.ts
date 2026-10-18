import 'server-only';
import type { MetadataRoute } from 'next';
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
  for (const path of ['', '/guide', '/terms', '/privacy', '/contact']) {
    const url = pageUrl(`/ko${path}`);
    entries.set(url, { url });
  }
  for (const game of (await getPublicCategories()).filter((item) => item.active)) {
    for (const board of gameBoards) {
      const url = pageUrl(appRoutes.boards('ko', board.slug, undefined, game.slug));
      entries.set(url, { url });
    }
  }
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
    const result = await getPublicPostList(cursor);
    for (const post of result.items) {
      if (post.author.isTestAccount) continue;
      const url = pageUrl(`/ko/posts/${encodeURIComponent(post.id)}`);
      entries.set(url, { url, lastModified: post.updatedAt });
      const authorUrl = pageUrl(`/ko/users/${encodeURIComponent(post.author.id)}`);
      entries.set(authorUrl, { url: authorUrl });
    }
    if (entries.size > 50_000) throw new Error('Sitemap requires partitioning.');
    if (!result.nextCursor) return [...entries.values()];
    if (cursors.has(result.nextCursor)) throw new Error('Sitemap pagination did not advance.');
    cursor = result.nextCursor;
    cursors.add(cursor);
  }
  throw new Error('Sitemap requires partitioning before exceeding the supported URL count.');
}
