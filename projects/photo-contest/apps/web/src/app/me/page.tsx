import { connection } from 'next/server';

import { MePage } from '@/_pages/me';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import {
  MeDocument,
  MyGalleryPostsDocument,
  MyGroupsDocument,
  NotificationUnreadCountDocument,
} from '@/shared/api/generated';

export default async function Page() {
  await connection();
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyGroupsDocument}>
        <PreloadQuery query={MyGalleryPostsDocument} variables={{ groupId: null, offset: 0, limit: 24 }}>
          <PreloadQuery query={NotificationUnreadCountDocument}>
            <MePage />
          </PreloadQuery>
        </PreloadQuery>
      </PreloadQuery>
    </PreloadQuery>
  );
}

export const instant = true;
