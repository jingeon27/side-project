import { GroupPageTemplate } from '@/_pages/group';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { GalleryDocument, GalleryPostsDocument, PostSort, MeDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={GalleryDocument} variables={{ id }}>
        <PreloadQuery
          query={GalleryPostsDocument}
          variables={{ groupId: id, sort: PostSort.Newest, offset: 0, limit: 24 }}
        >
          <PreloadQuery
            query={GalleryPostsDocument}
            variables={{ groupId: id, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 }}
          >
            <GroupPageTemplate id={id} />
          </PreloadQuery>
        </PreloadQuery>
      </PreloadQuery>
    </PreloadQuery>
  );
}
