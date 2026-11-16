'use client';

import { useParams } from 'next/navigation';

import { GroupPendingFrame } from '@/features/group';
import { ROUTES } from '@/shared/constants/routes';

export function GroupPendingPage() {
  const { id } = useParams<{ id: string }>();
  return <GroupPendingFrame groupId={id} backHref={ROUTES.EXPLORE} />;
}
