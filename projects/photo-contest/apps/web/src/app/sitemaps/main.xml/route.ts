import { connection } from 'next/server';

import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapDocument, sitemapResponse } from '@/shared/lib/sitemap.helper';

export async function GET() {
  await connection();
  const origin = getWebOrigin();
  return sitemapResponse(
    sitemapDocument([
      siteUrl(ROUTES.HOME, origin),
      siteUrl(ROUTES.LANDING, origin),
      siteUrl(ROUTES.HOW_IT_WORKS, origin),
      siteUrl(ROUTES.EXPLORE, origin),
    ]),
  );
}
