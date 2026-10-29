'use client';

import { useFragment, useMutation, useQuery } from '@apollo/client/react';
import { overlay } from 'overlay-kit';

import { Mention } from '@side/design-system';

import {
  DeletePostCommentDocument,
  GalleryPostAuthorFragmentDoc,
  MeDocument,
  PostCommentCardFragmentDoc,
  PostCommentsDocument,
  RefreshPostDocument,
} from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { formatDateTime } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { PostCommentLikeButton } from '../PostCommentLikeButton';

export function PostCommentRow({ id, replyToName }: { id: string; replyToName?: string }) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id },
  });
  // '나'·'작성자' 표시는 이 행만 쓰므로 목록에서 내려받지 않고 같은 캐시에서 읽는다.
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const post = useFragment({
    fragment: GalleryPostAuthorFragmentDoc,
    from: complete ? { __typename: 'GalleryPost', id: comment.postId } : null,
  });
  const [remove] = useMutation(DeletePostCommentDocument, {
    refetchQueries: [PostCommentsDocument],
    awaitRefetchQueries: true,
  });
  if (!complete) return null;
  const isMine = comment.author.id === viewer?.me?.id;
  const isPostAuthor = post.complete && comment.author.id === post.data.author.id;
  return (
    <div id={`comment-${id}`} className="flex scroll-mt-6 items-start gap-3">
      <Avatar name={comment.author.nickname} src={comment.author.avatar} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-1.5 text-caption font-semibold text-ink">
          <span className="min-w-0 truncate">{comment.author.nickname}</span>
          {isMine ? <span className="text-micro font-normal text-muted">나</span> : null}
          {isPostAuthor ? <span className="text-micro font-normal text-muted">작성자</span> : null}
        </p>
        <p
          className={cn(
            'w-fit max-w-full rounded-card px-3 py-2.5 text-body leading-relaxed whitespace-pre-wrap wrap-break-word',
            isMine ? 'bg-sunken text-ink' : 'bg-surface text-ink',
          )}
        >
          {replyToName ? (
            <>
              <Mention nickname={replyToName} />{' '}
            </>
          ) : null}
          {comment.body}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <PostCommentLikeButton id={id} />
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
                overlay.open(({ isOpen, close: onClose, unmount }) => (
                  <ConfirmDialog
                    isOpen={isOpen}
                    onClose={onClose}
                    unmount={unmount}
                    title="댓글을 삭제할까요?"
                    description={
                      comment.replyCount
                        ? '댓글과 답글, 연결된 좋아요가 함께 삭제됩니다.'
                        : '삭제한 댓글은 다시 볼 수 없어요.'
                    }
                    confirmLabel="댓글 삭제하기"
                    tone="danger"
                    onConfirm={async () => {
                      await remove({
                        variables: { commentId: id },
                        refetchQueries: [
                          PostCommentsDocument,
                          { query: RefreshPostDocument, variables: { id: comment.postId } },
                        ],
                      });
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
    </div>
  );
}
