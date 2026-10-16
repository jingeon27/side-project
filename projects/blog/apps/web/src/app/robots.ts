import type { MetadataRoute } from 'next';
import { absoluteUrl, siteUrl } from '@/shared/config/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/_next/'] },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl.origin,
  };
}
