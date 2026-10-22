'use client';

import { useMutation } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import { resetGalleryPosts } from '@/features/post';
import {
  GalleryDocument,
  GalleryPostsDocument,
  GroupVisibility,
  LeaveGroupDocument,
  MyGroupsDocument,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { removeMyGroup } from '../model/group.cache';

/** 본인이 그룹을 나간다. 그룹장은 보이지 않는다(관리자를 양도한 뒤 나간다). */
export function LeaveGroupButton({
  groupId,
  groupName,
  visibility,
}: {
  groupId: string;
  groupName: string;
  visibility: GroupVisibility;
}) {
  const [leave, { loading }] = useMutation(LeaveGroupDocument, {
    update: (cache) => {
      removeMyGroup(cache, groupId);
      resetGalleryPosts(cache);
    },
    refetchQueries: [GalleryDocument, MyGroupsDocument, GalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={loading}
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <ConfirmDialog
            isOpen={isOpen}
            onClose={close}
            unmount={unmount}
            tone="danger"
            title={`${groupName}에서 나갈까요?`}
            description={
              visibility === GroupVisibility.Private
                ? '남긴 게시물과 댓글은 그대로 남아요. 비공개 그룹이라 다시 들어오려면 가입 승인을 받아야 해요.'
                : '남긴 게시물과 댓글은 그대로 남아요. 공개 그룹이라 언제든 다시 가입할 수 있어요.'
            }
            confirmLabel="그룹 나가기"
            onConfirm={async () => {
              await leave({ variables: { groupId } });
              toast.success('그룹에서 나왔어요');
            }}
          />
        ))
      }
    >
      그룹 나가기
    </Button>
  );
}
