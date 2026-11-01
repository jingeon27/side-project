import { connection } from 'next/server';

import { InvitePage } from '@/_pages/invite';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { InvitePreviewDocument, MeDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={InvitePreviewDocument} variables={{ token }}>
        <InvitePage token={token} />
      </PreloadQuery>
    </PreloadQuery>
  );
}
