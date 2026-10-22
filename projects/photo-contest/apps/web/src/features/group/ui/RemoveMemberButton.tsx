'use client';

import { useMutation } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import { GalleryDocument, MyGroupsDocument, RemoveGroupMemberDocument } from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

/** 관리자가 멤버를 내보낸다. 보여 줄지는 MemberList가 canRemoveMember로 정한다. */
export function RemoveMemberButton({
  groupId,
  userId,
  nickname,
}: {
  groupId: string;
  userId: string;
  nickname: string;
}) {
  const [remove, { loading }] = useMutation(RemoveGroupMemberDocument, {
    refetchQueries: [GalleryDocument, MyGroupsDocument],
    awaitRefetchQueries: true,
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={loading}
      aria-label={`${nickname} 내보내기`}
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <ConfirmDialog
            isOpen={isOpen}
            onClose={close}
            unmount={unmount}
            tone="danger"
            title={`${nickname}님을 그룹에서 내보낼까요?`}
            description="남긴 게시물과 댓글은 그대로 남아요. 비공개 그룹이면 다시 들어오려면 가입 승인을 받아야 해요."
            confirmLabel="내보내기"
            onConfirm={async () => {
              await remove({ variables: { groupId, userId } });
              toast.success('멤버를 내보냈어요');
            }}
          />
        ))
      }
    >
      내보내기
    </Button>
  );
}
