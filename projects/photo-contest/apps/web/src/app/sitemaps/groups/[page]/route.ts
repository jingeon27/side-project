import { getPublicGroupSitemapPage, PUBLIC_GROUP_SITEMAP_SIZE } from '@/_pages/group';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { siteUrl } from '@/shared/lib/seo.helper';
import { sitemapDocument, sitemapResponse } from '@/shared/lib/sitemap.helper';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!/^(0|[1-9]\d*)\.xml$/.test(page)) return new Response(null, { status: 404 });
  const index = Number(page.slice(0, -4));
  if (!Number.isSafeInteger(index) || index * PUBLIC_GROUP_SITEMAP_SIZE > 2_147_483_647)
    return new Response(null, { status: 404 });
  const groups = await getPublicGroupSitemapPage(index);
  if (!groups.length) return new Response(null, { status: 404 });
  return sitemapResponse(
    sitemapDocument(
      groups.flatMap((group) =>
        [ROUTES.GROUP(group.id), ROUTES.GROUP_CONTESTS(group.id), ROUTES.GROUP_HALL_OF_FAME(group.id)].map(
          (path) => siteUrl(path, getWebOrigin()),
        ),
      ),
    ),
  );
}
