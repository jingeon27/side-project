import type { MetadataRoute } from 'next';

import { getWebOrigin } from '@/shared/api/server-request.helper';
import { siteUrl } from '@/shared/lib/seo.helper';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/me',
        '/invite/',
        '/contests/',
        '/app-auth/',
        '/backend/graphql',
        '/backend/auth/',
        '/backend/testing/',
      ],
    },
    sitemap: siteUrl('/sitemap.xml', getWebOrigin()),
  };
}
