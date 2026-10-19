'use client';

import { useMutation } from '@apollo/client/react';
import { overlay } from 'overlay-kit';
import {
  GalleryDocument,
  GroupContestsDocument,
  GroupContestDocument,
  GroupRole,
  MyGroupsDocument,
  SetGroupModeratorDocument,
  TransferGroupOwnershipDocument,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

const refetchQueries = [GalleryDocument, MyGroupsDocument, GroupContestsDocument, GroupContestDocument];
export function MemberRoleActions({
  groupId,
  userId,
  nickname,
  role,
}: {
  groupId: string;
  userId: string;
  nickname: string;
  role: GroupRole;
}) {
  const [setModerator, state] = useMutation(SetGroupModeratorDocument, {
    refetchQueries,
    awaitRefetchQueries: true,
  });
  const [transfer, transferState] = useMutation(TransferGroupOwnershipDocument, {
    refetchQueries,
    awaitRefetchQueries: true,
  });
  if (role === GroupRole.Owner) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={state.loading}
        disabled={transferState.loading}
        aria-label={`${nickname} 부관리자 ${role === GroupRole.Moderator ? '해제' : '임명'}`}
        onClick={async () => {
          try {
            await setModerator({ variables: { groupId, userId, enabled: role !== GroupRole.Moderator } });
            toast.success(role === GroupRole.Moderator ? '부관리자를 해제했어요' : '부관리자로 임명했어요');
          } catch {
            /* ErrorLink가 알린다. */
          }
        }}
      >
        {role === GroupRole.Moderator ? '부관리자 해제' : '부관리자 임명'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={state.loading || transferState.loading}
        aria-label={`${nickname} 관리자 양도`}
        onClick={() =>
          overlay.open(({ isOpen, close, unmount }) => (
            <ConfirmDialog
              isOpen={isOpen}
              onClose={close}
              unmount={unmount}
              title={`${nickname}님에게 관리자를 양도할까요?`}
              description="선택한 멤버가 그룹장이 되고 나는 일반 멤버로 변경됩니다. 이후 부관리자 임명과 관리자 양도는 새 그룹장만 할 수 있어요."
              confirmLabel="관리자 양도하기"
              onConfirm={async () => {
                await transfer({ variables: { groupId, userId } });
                toast.success('관리자를 양도했어요');
              }}
            />
          ))
        }
      >
        관리자 양도
      </Button>
    </div>
  );
}
