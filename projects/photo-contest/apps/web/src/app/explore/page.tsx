import type { Metadata } from 'next';

import { ExplorePageTemplate, exploreSearchSchema } from '@/_pages/explore';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { DiscoverGroupsDocument, MeDocument } from '@/shared/api/generated';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata } from '@/shared/lib/seo.helper';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const { q } = exploreSearchSchema.parse(await searchParams);
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.EXPLORE,
    title: '그룹 탐색',
    description: '공개 그룹의 게시물을 둘러보고, 마음에 드는 그룹에 가입하거나 직접 만들어 보세요.',
    index: !q,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q: search } = exploreSearchSchema.parse(await searchParams);
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={DiscoverGroupsDocument} variables={{ search, offset: 0, limit: 24 }}>
        <ExplorePageTemplate search={search} />
      </PreloadQuery>
    </PreloadQuery>
  );
}
