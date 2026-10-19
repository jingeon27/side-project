import { getPublicGroupCount, PUBLIC_GROUP_SITEMAP_SIZE } from '@/_pages/group';
import { getPublicGroupContestCount, PUBLIC_CONTEST_SITEMAP_SIZE } from '@/_pages/group-contests';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapIndex, sitemapResponse } from '@/shared/lib/sitemap.helper';

export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = getWebOrigin();
  const [count, contestCount] = await Promise.all([getPublicGroupCount(), getPublicGroupContestCount()]);
  const urls = [
    siteUrl('/sitemaps/main.xml', origin),
    ...Array.from({ length: Math.ceil(count / PUBLIC_GROUP_SITEMAP_SIZE) }, (_, page) =>
      siteUrl(`/sitemaps/groups/${page}.xml`, origin),
    ),
    ...Array.from({ length: Math.ceil(contestCount / PUBLIC_CONTEST_SITEMAP_SIZE) }, (_, page) =>
      siteUrl(`/sitemaps/contests/${page}.xml`, origin),
    ),
  ];
  return sitemapResponse(sitemapIndex(urls));
}
