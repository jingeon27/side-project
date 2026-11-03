import type { MetadataRoute } from 'next';

import { locales } from '@/i18n/routing';
import { absoluteUrl, siteUrl } from '@/shared/config/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: locales.map((locale) => absoluteUrl(`/${locale}/sitemap.xml`)),
    host: siteUrl.origin,
  };
}
