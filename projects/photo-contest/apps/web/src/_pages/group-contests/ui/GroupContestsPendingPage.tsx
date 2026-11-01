'use client';

import { useParams } from 'next/navigation';

import { GroupPendingFrame } from '@/features/group';
import { ROUTES } from '@/shared/constants/routes';

export function GroupContestsPendingPage({ hallOfFame = false }: { hallOfFame?: boolean }) {
  const { id } = useParams<{ id: string }>();
  return (
    <GroupPendingFrame
      groupId={id}
      title={hallOfFame ? '지난 대회 명예의 전당' : '그룹 대회'}
      backHref={ROUTES.GROUP(id)}
    />
  );
}
