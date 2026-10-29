import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { GroupWritePageTemplate } from '@/_pages/group-write';
import { PreloadQuery, query } from '@/shared/api/apollo-client.server';
import { GalleryDocument, MeDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { PRIVATE_ROBOTS } from '@/shared/lib/seo.helper';

export const metadata: Metadata = { title: '그룹에 글쓰기', robots: PRIVATE_ROBOTS };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contestId?: string }>;
}) {
  const { id } = await params;
  const { data } = await query({ query: GalleryDocument, variables: { id }, errorPolicy: 'all' });
  if (!data?.group.role) redirect(ROUTES.GROUP(id));
  const contestId = (await searchParams).contestId;
  return (
    <PreloadQuery query={MeDocument}>
      <GroupWritePageTemplate groupId={id} groupName={data.group.name} contestId={contestId} />
    </PreloadQuery>
  );
}
