'use client';

import { useParams } from 'next/navigation';

import { GroupPendingFrame } from '@/features/group';
import { ROUTES } from '@/shared/constants/routes';

export function GroupContestPendingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <GroupPendingFrame
      groupId={id}
      title="대회"
      backHref={ROUTES.GROUP_CONTESTS(id)}
      showNavigation={false}
    />
  );
}
