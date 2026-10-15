import { MePageTemplate } from '@/_pages/me';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument, MyGroupsDocument } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={MyGroupsDocument}>
        <MePageTemplate />
      </PreloadQuery>
    </PreloadQuery>
  );
}
