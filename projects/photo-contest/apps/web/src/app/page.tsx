import { HomePageTemplate } from '@/_pages/home';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument, MyGroupsDocument } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyGroupsDocument}>
        <HomePageTemplate />
      </PreloadQuery>
    </PreloadQuery>
  );
}
