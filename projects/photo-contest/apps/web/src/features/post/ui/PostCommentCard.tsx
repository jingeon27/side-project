'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import {
  DeletePostCommentDocument,
  GalleryPostsDocument,
  PostCommentCardFragmentDoc,
  PostCommentsDocument,
} from '@/shared/api/generated';
import { formatDateTime } from '@/shared/lib/format.helper';
import { cn } from '@/shared/lib/cn.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { Button } from '@/shared/ui/@core/button';

export function PostCommentCard({
  id,
  viewerId,
  postAuthorId,
}: {
  id: string;
  viewerId?: string;
  postAuthorId?: string;
}) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id },
  });
  const [remove] = useMutation(DeletePostCommentDocument, {
    refetchQueries: [PostCommentsDocument, GalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  if (!complete) return null;
  const isMine = comment.author.id === viewerId;
  return (
    <li className={cn('flex items-start gap-3', isMine && 'flex-row-reverse')}>
      <Avatar name={comment.author.nickname} src={comment.author.avatar} size="sm" />
      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-1', isMine ? 'items-end' : 'items-start')}>
        <p className="flex flex-wrap items-center gap-1.5 text-caption font-semibold text-ink">
          <span className="min-w-0 truncate">{comment.author.nickname}</span>
          {isMine ? <span className="text-micro font-normal text-muted">나</span> : null}
          {comment.author.id === postAuthorId ? (
            <span className="text-micro font-normal text-muted">작성자</span>
          ) : null}
        </p>
        <p
          className={cn(
            'max-w-full rounded-card px-3.5 py-2.5 text-body whitespace-pre-wrap wrap-break-word',
            isMine ? 'rounded-tr-badge bg-brand text-on-brand' : 'rounded-tl-badge bg-neutral-soft text-ink',
          )}
        >
          {comment.body}
        </p>
        <div className={cn('flex items-center gap-1', isMine && 'flex-row-reverse')}>
          <time className="text-micro text-muted" dateTime={comment.createdAt}>
            {formatDateTime(comment.createdAt)}
          </time>
          {comment.canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-micro text-muted"
              aria-label={`${comment.author.nickname} 댓글 삭제`}
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
              삭제
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
