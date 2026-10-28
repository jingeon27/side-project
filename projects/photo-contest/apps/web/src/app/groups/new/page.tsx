import type { Metadata } from 'next';

import { GroupCreatePageTemplate } from '@/_pages/group-create';
import { PRIVATE_ROBOTS } from '@/shared/lib/seo.helper';

export const metadata: Metadata = { title: '그룹 만들기', robots: PRIVATE_ROBOTS };

export default function Page() {
  return <GroupCreatePageTemplate />;
}
