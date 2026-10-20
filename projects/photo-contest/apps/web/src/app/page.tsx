import { HomePageTemplate } from '@/_pages/home';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MyGroupsDocument, MeDocument, GalleryPostsDocument, PostSort } from '@/shared/api/generated';
import type { Metadata } from 'next';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export function generateMetadata(): Metadata {
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.HOME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  });
}

export default function Page() {
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
        <PreloadQuery query={MyGroupsDocument} errorPolicy="all">
          <PreloadQuery
            query={GalleryPostsDocument}
            errorPolicy="all"
            variables={{ groupId: null, sort: PostSort.Newest, offset: 0, limit: 24 }}
          >
            <PreloadQuery
              query={GalleryPostsDocument}
              errorPolicy="all"
              variables={{ groupId: null, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 }}
            >
              <HomePageTemplate />
            </PreloadQuery>
          </PreloadQuery>
        </PreloadQuery>
      </PreloadQuery>
    </>
  );
}
