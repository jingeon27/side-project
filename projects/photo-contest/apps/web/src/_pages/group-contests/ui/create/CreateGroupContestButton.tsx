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
    // 주황 알약은 만들기 진입이고(docs/implementation.md), 시트 안의 같은 이름 제출 버튼은 primary(검정)다.
    <Button
      variant="accent"
      size="md"
      shape="pill"
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <CreateGroupContestBottomSheet
            groupId={groupId}
            isOpen={isOpen}
            onClose={onClose}
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
