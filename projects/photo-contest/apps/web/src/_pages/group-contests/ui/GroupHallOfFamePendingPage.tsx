'use client';

import { useParams } from 'next/navigation';

import { GroupPendingFrame } from '@/features/group';
import { ROUTES } from '@/shared/constants/routes';

export function GroupHallOfFamePendingPage() {
  const params = useParams<{ id: string }>();
  return (
    <GroupPendingFrame groupId={params.id} title="지난 대회 명예의 전당" backHref={ROUTES.GROUP(params.id)} />
  );
}
