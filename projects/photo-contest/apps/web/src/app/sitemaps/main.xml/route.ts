import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapDocument, sitemapResponse } from '@/shared/lib/sitemap.helper';

export const dynamic = 'force-dynamic';

export function GET() {
  const origin = getWebOrigin();
  return sitemapResponse(sitemapDocument([siteUrl(ROUTES.HOME, origin), siteUrl(ROUTES.EXPLORE, origin)]));
}
