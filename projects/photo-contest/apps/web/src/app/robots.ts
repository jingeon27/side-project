import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import { getWebOrigin } from '@/shared/api/server-request.helper';
import { siteUrl } from '@/shared/lib/seo.helper';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/me', '/invite/', '/contests/', '/backend/graphql', '/backend/auth/', '/backend/testing/'],
    },
    sitemap: siteUrl('/sitemap.xml', getWebOrigin()),
  };
}
