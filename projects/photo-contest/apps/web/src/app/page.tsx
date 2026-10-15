import { HomePageTemplate } from '@/_pages/home';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument, MyPhotoFeedDocument } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyPhotoFeedDocument} variables={{ offset: 0, limit: 24 }}>
        <HomePageTemplate />
      </PreloadQuery>
    </PreloadQuery>
  );
}
