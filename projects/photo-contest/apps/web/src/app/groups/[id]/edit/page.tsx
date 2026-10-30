import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { GroupEditPageTemplate } from '@/_pages/group-edit';
import { PreloadQuery, query } from '@/shared/api/apollo-client.server';
import { GroupProfileDocument, GroupRole } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { PRIVATE_ROBOTS } from '@/shared/lib/seo.helper';

export const metadata: Metadata = { title: '그룹 프로필 수정', robots: PRIVATE_ROBOTS };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await query({ query: GroupProfileDocument, variables: { id }, errorPolicy: 'all' });
  if (data?.group.role !== GroupRole.Owner && data?.group.role !== GroupRole.Moderator)
    redirect(ROUTES.GROUP(id));
  return (
    <PreloadQuery query={GroupProfileDocument} variables={{ id }}>
      <GroupEditPageTemplate groupId={id} />
    </PreloadQuery>
  );
}
