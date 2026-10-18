import { getPublicGroupCount, PUBLIC_GROUP_SITEMAP_SIZE } from '@/_pages/group';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapIndex, sitemapResponse } from '@/shared/lib/sitemap.helper';

export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = getWebOrigin();
  const count = await getPublicGroupCount();
  const urls = [
    siteUrl('/sitemaps/main.xml', origin),
    ...Array.from({ length: Math.ceil(count / PUBLIC_GROUP_SITEMAP_SIZE) }, (_, page) =>
      siteUrl(`/sitemaps/groups/${page}.xml`, origin),
    ),
  ];
  return sitemapResponse(sitemapIndex(urls));
}
