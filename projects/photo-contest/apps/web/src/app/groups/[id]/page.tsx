import { GroupPageTemplate } from '@/_pages/group';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { GroupDocument, MeDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={GroupDocument} variables={{ id }}>
        <GroupPageTemplate id={id} />
      </PreloadQuery>
    </PreloadQuery>
  );
}
