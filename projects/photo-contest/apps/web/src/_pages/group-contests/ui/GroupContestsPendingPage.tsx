'use client';

import { useParams } from 'next/navigation';

import { GroupPendingFrame } from '@/features/group';
import { ROUTES } from '@/shared/constants/routes';

export function GroupContestsPendingPage() {
  const params = useParams<{ id: string }>();
  return <GroupPendingFrame groupId={params.id} title="그룹 대회" backHref={ROUTES.GROUP(params.id)} />;
}
