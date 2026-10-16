'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Trash2 } from 'lucide-react';
import { overlay } from 'overlay-kit';

import {
  DeletePostCommentDocument,
  GalleryPostsDocument,
  PostCommentCardFragmentDoc,
  PostCommentsDocument,
} from '@/shared/api/generated';
import { formatDateTime } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { IconButton } from '@/shared/ui/@core/icon-button';

export function PostCommentCard({ id }: { id: string }) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id },
  });
  const [remove] = useMutation(DeletePostCommentDocument, {
    refetchQueries: [PostCommentsDocument, GalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  if (!complete) return null;
  return (
    <li className="flex items-start gap-3 border-b border-line py-4">
      <Avatar name={comment.author.nickname} src={comment.author.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-label text-ink">{comment.author.nickname}</p>
        <p className="mt-1 text-body whitespace-pre-wrap wrap-break-word text-ink">{comment.body}</p>
        <time className="mt-2 block text-caption text-muted" dateTime={comment.createdAt}>
          {formatDateTime(comment.createdAt)}
        </time>
      </div>
      {comment.canDelete ? (
        <IconButton
          label={`${comment.author.nickname} 댓글 삭제`}
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <ConfirmDialog
                isOpen={isOpen}
                onClose={close}
                unmount={unmount}
                title="댓글을 삭제할까요?"
                description="삭제한 댓글은 다시 볼 수 없어요."
                confirmLabel="댓글 삭제하기"
                tone="danger"
                onConfirm={async () => {
                  await remove({ variables: { commentId: id } });
                }}
              />
            ))
          }
        >
          <Trash2 aria-hidden className="size-4 text-muted" />
        </IconButton>
      ) : null}
    </li>
  );
}
