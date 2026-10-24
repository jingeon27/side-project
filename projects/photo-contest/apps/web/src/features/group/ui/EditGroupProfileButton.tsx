'use client';

import { useFragment } from '@apollo/client/react';
import { Pencil } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { GroupAccessFragmentDoc } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { Button } from '@/shared/ui/@core/button';

import { isGroupAdmin } from '../lib/group.helper';
import { EditGroupProfileBottomSheet } from './EditGroupProfileBottomSheet';

export function EditGroupProfileButton({ groupId, className }: { groupId: string; className?: string }) {
  const { data, complete } = useFragment({
    fragment: GroupAccessFragmentDoc,
    from: { __typename: 'Group', id: groupId },
  });
  if (!complete || !isGroupAdmin(data.role)) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn('gap-2 rounded-full', className)}
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <EditGroupProfileBottomSheet
            groupId={groupId}
            isOpen={isOpen}
            onClose={onClose}
            unmount={unmount}
          />
        ))
      }
    >
      <Pencil aria-hidden className="size-3.5" />
      그룹 프로필 수정
    </Button>
  );
}
