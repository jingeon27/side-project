import { InvitePageTemplate } from '@/_pages/invite';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { InvitePreviewDocument, MeDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={InvitePreviewDocument} variables={{ token }}>
        <InvitePageTemplate token={token} />
      </PreloadQuery>
    </PreloadQuery>
  );
}
