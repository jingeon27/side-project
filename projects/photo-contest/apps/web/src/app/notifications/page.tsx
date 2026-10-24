import { NotificationsPageTemplate } from '@/_pages/notifications';
import { PreloadQuery, query } from '@/shared/api/apollo-client.server';
import { MeDocument, MyNotificationsDocument } from '@/shared/api/generated';

export default async function Page() {
  const { data } = await query({ query: MeDocument });
  return (
    <PreloadQuery query={MeDocument}>
      {data?.me ? (
        <PreloadQuery query={MyNotificationsDocument} variables={{ offset: 0, limit: 20 }}>
          <NotificationsPageTemplate />
        </PreloadQuery>
      ) : (
        <NotificationsPageTemplate />
      )}
    </PreloadQuery>
  );
}
