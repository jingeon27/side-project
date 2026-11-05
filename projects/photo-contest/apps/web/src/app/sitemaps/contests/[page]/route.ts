import { connection } from 'next/server';

import { sortBy } from 'es-toolkit';

import {
  getPublicGroupContestCount,
  getPublicGroupContestSitemapPage,
  PUBLIC_CONTEST_SITEMAP_SIZE,
} from '@/_pages/group-contests/index.server';
import { Phase } from '@/shared/api/generated';
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
  if (
    page === null ||
    page >= sitemapPageCount(await getPublicGroupContestCount(), PUBLIC_CONTEST_SITEMAP_SIZE)
  )
    return new Response(null, { status: 404 });
  const contests = await getPublicGroupContestSitemapPage(page);
  if (!contests.length) return new Response(null, { status: 404 });
  // 같은 키는 Map에 마지막으로 넣은 값이 남는다. 오래된 순으로 넣어 목록 화면이 가장 늦은 대회의 시각을 갖게 한다.
  const lastModifiedByPath = new Map(
    sortBy(contests, [(contest) => Date.parse(contest.lastModifiedAt)]).flatMap((contest) => [
      [ROUTES.GROUP_CONTEST(contest.groupId, contest.id), contest.lastModifiedAt] as const,
      // 빈 목록 화면은 색인할 내용이 없으므로 이 대회가 실제로 보이는 목록만 올린다.
      [
        contest.phase === Phase.Completed
          ? ROUTES.GROUP_HALL_OF_FAME(contest.groupId)
          : ROUTES.GROUP_CONTESTS(contest.groupId),
        contest.lastModifiedAt,
      ] as const,
    ]),
  );
  return sitemapResponse(
    sitemapDocument(
      [...lastModifiedByPath].map(([path, lastModified]) => ({
        url: siteUrl(path, getWebOrigin()),
        lastModified,
      })),
    ),
  );
}
