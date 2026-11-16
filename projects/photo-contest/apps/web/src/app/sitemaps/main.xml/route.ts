import { connection } from 'next/server';

import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapDocument, sitemapResponse } from '@/shared/lib/sitemap.helper';

export async function GET() {
  await connection();
  const origin = getWebOrigin();
  return sitemapResponse(
    sitemapDocument(
      [ROUTES.HOME, ROUTES.LANDING, ROUTES.HOW_IT_WORKS, ROUTES.EXPLORE].map((path) => ({
        url: siteUrl(path, origin),
      })),
    ),
  );
}
