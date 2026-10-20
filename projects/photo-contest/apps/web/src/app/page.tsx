import { HomePageTemplate } from '@/_pages/home';
import { PreloadQuery, query } from '@/shared/api/apollo-client.server';
import {
  DiscoverGroupsDocument,
  GalleryPostsDocument,
  GroupVisibility,
  MeDocument,
  MyGroupsDocument,
  PostSort,
  PublicGalleryPostsDocument,
} from '@/shared/api/generated';
import { publicPreloadContext } from '@/shared/api/public-cache.policy';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.HOME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  });
}

export default async function Page() {
  const { data: viewer } = await query({ query: MeDocument });
  const groups = viewer?.me ? await query({ query: MyGroupsDocument }) : null;
  const showPublic = !groups?.data?.myGroups.length;
  const home = showPublic ? (
    <PreloadQuery
      query={DiscoverGroupsDocument}
      variables={{ visibility: GroupVisibility.Public, offset: 0, limit: 6 }}
      context={publicPreloadContext(DiscoverGroupsDocument)}
    >
      <PreloadQuery
        query={PublicGalleryPostsDocument}
        variables={{ sort: PostSort.Newest, offset: 0, limit: 24 }}
        context={publicPreloadContext(PublicGalleryPostsDocument)}
      >
        <HomePageTemplate />
      </PreloadQuery>
    </PreloadQuery>
  ) : (
    <PreloadQuery
      query={GalleryPostsDocument}
      variables={{ groupId: null, sort: PostSort.Newest, offset: 0, limit: 24 }}
    >
      <PreloadQuery
        query={GalleryPostsDocument}
        variables={{ groupId: null, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 }}
      >
        <HomePageTemplate />
      </PreloadQuery>
    </PreloadQuery>
  );
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': siteUrl('/#website', getWebOrigin()),
          name: SITE_NAME,
          url: siteUrl(ROUTES.HOME, getWebOrigin()),
          inLanguage: 'ko-KR',
        }}
      />
      <PreloadQuery query={MeDocument}>
        {viewer?.me ? <PreloadQuery query={MyGroupsDocument}>{home}</PreloadQuery> : home}
      </PreloadQuery>
    </>
  );
}
