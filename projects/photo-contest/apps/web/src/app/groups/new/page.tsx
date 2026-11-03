import type { Metadata } from 'next';
import { connection } from 'next/server';

import { GroupCreatePage } from '@/_pages/group-create';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument } from '@/shared/api/generated';
import { PRIVATE_ROBOTS } from '@/shared/lib/seo.helper';

export const metadata: Metadata = { title: '그룹 만들기', robots: PRIVATE_ROBOTS };

export default async function Page() {
  await connection();
  return (
    <PreloadQuery query={MeDocument}>
      <GroupCreatePage />
    </PreloadQuery>
  );
}
