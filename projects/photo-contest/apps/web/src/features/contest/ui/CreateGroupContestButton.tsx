'use client';

import { useFragment } from '@apollo/client/react';
import { Plus } from 'lucide-react';
import { overlay } from 'overlay-kit';
import { isGroupAdmin } from '@/features/group';
import { GroupAccessFragmentDoc } from '@/shared/api/generated';
import { Button } from '@/shared/ui/@core/button';
import { CreateGroupContestBottomSheet } from './CreateGroupContestBottomSheet';

export function CreateGroupContestButton({ groupId }: { groupId: string }) {
  const { data, complete } = useFragment({
    fragment: GroupAccessFragmentDoc,
    from: { __typename: 'Group', id: groupId },
  });
  if (!complete || !isGroupAdmin(data.role)) return null;
  return (
    <Button
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <CreateGroupContestBottomSheet
            groupId={groupId}
            isOpen={isOpen}
            onClose={close}
            unmount={unmount}
          />
        ))
      }
    >
      <Plus aria-hidden className="size-4" />
      대회 개최하기
    </Button>
  );
}
