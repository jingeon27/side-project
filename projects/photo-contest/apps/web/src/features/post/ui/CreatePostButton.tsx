'use client';

import { Plus } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';

export function CreatePostButton({ groupId, contestId }: { groupId: string; contestId?: string }) {
  return (
    <ButtonLink href={ROUTES.GROUP_WRITE(groupId, contestId)}>
      <Plus aria-hidden className="size-4" />
      글쓰기
    </ButtonLink>
  );
}
