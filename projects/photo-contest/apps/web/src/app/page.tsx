import { HomePageTemplate } from '@/_pages/home';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument, GalleryPostsDocument, PostSort } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
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
    </PreloadQuery>
  );
}
