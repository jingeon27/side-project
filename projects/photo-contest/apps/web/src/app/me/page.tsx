import { MePageTemplate } from '@/_pages/me';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import {
  MeDocument,
  MyGalleryPostsDocument,
  MyGroupsDocument,
  NotificationUnreadCountDocument,
} from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyGroupsDocument}>
        <PreloadQuery query={MyGalleryPostsDocument} variables={{ groupId: null, offset: 0, limit: 24 }}>
          <PreloadQuery query={NotificationUnreadCountDocument}>
            <MePageTemplate />
          </PreloadQuery>
        </PreloadQuery>
      </PreloadQuery>
    </PreloadQuery>
  );
}
