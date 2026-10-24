import { connection } from 'next/server';

import { getPublicGroupCount, getPublicGroupSitemapPage, PUBLIC_GROUP_SITEMAP_SIZE } from '@/_pages/group';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { siteUrl } from '@/shared/lib/seo.helper';
import {
  parseSitemapFileName,
  sitemapDocument,
  sitemapPageCount,
  sitemapResponse,
} from '@/shared/lib/sitemap.helper';

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  await connection();
  const page = parseSitemapFileName((await params).page);
  // 색인과 같은 (캐시된) 개수로 범위를 정한다. 범위 밖 번호마다 조회하면 데이터 캐시에 빈 결과 키가 쌓인다.
  if (page === null || page >= sitemapPageCount(await getPublicGroupCount(), PUBLIC_GROUP_SITEMAP_SIZE))
    return new Response(null, { status: 404 });
  const groups = await getPublicGroupSitemapPage(page);
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
