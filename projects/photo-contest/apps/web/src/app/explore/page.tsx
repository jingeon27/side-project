import { ExplorePageTemplate } from '@/_pages/explore';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { DiscoverGroupsDocument, MeDocument } from '@/shared/api/generated';
import type { Metadata } from 'next';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata } from '@/shared/lib/seo.helper';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.EXPLORE,
    title: '그룹 탐색',
    description: '공개 그룹에서 사진·동영상·합성을 둘러보고, 취향이 맞는 그룹을 찾거나 직접 만들어 보세요.',
    index: !(typeof q === 'string' && q.trim()),
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const search = typeof q === 'string' ? q.trim().slice(0, 40) : '';
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={DiscoverGroupsDocument} variables={{ search, offset: 0, limit: 24 }}>
        <ExplorePageTemplate search={search} />
      </PreloadQuery>
    </PreloadQuery>
  );
}
