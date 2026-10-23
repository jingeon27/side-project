import { MePageTemplate } from '@/_pages/me';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument, MyGalleryPostsDocument, MyGroupsDocument } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyGroupsDocument}>
        <PreloadQuery query={MyGalleryPostsDocument} variables={{ groupId: null, offset: 0, limit: 24 }}>
          <MePageTemplate />
        </PreloadQuery>
      </PreloadQuery>
    </PreloadQuery>
  );
}
