import type { MetadataRoute } from 'next';

import { episodes, episodeShareUrl } from '@/shared/episodes';
import { siteOrigin } from '@/shared/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['/', '/stories', '/reading', '/shop', '/privacy'].map(
    (path) => new URL(path, siteOrigin).href,
  );
  return [...pages, ...episodes.map((episode) => episodeShareUrl(episode.slug))].map((url) => ({ url }));
}
