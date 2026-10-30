'use client';

import { useFragment } from '@apollo/client/react';
import { Pencil } from 'lucide-react';

import { GroupAccessFragmentDoc } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';
import { ButtonLink } from '@/shared/ui/@core/button';

import { isGroupAdmin } from '../../lib/group.helper';

export function EditGroupProfileLink({ groupId, className }: { groupId: string; className?: string }) {
  const { data, complete } = useFragment({
    fragment: GroupAccessFragmentDoc,
    from: { __typename: 'Group', id: groupId },
  });
  if (!complete || !isGroupAdmin(data.role)) return null;
  return (
    <ButtonLink
      href={ROUTES.GROUP_EDIT(groupId)}
      variant="secondary"
      size="sm"
      className={cn('gap-2 rounded-full', className)}
    >
      <Pencil aria-hidden className="size-3.5" />
      그룹 프로필 수정
    </ButtonLink>
  );
}
