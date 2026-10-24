'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart } from 'lucide-react';

import {
  LikePostCommentDocument,
  PostCommentCardFragmentDoc,
  UnlikePostCommentDocument,
} from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { formatCount } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

export function PostCommentLikeButton({ id }: { id: string }) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id },
  });
  const [like, likeState] = useMutation(LikePostCommentDocument);
  const [unlike, unlikeState] = useMutation(UnlikePostCommentDocument);
  if (!complete) return null;
  const label = `댓글 좋아요 ${formatCount(comment.likeCount)}개`;
  const heart = (
    <Heart aria-hidden className={cn('size-4', comment.likedByMe && 'fill-current')} strokeWidth={1.5} />
  );
  if (!comment.canInteract)
    return (
      <span
        aria-label={label}
        className="inline-flex min-h-touch items-center gap-1.5 px-2 text-micro text-muted"
      >
        {heart}
        {formatCount(comment.likeCount)}
      </span>
    );

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-pressed={comment.likedByMe}
      disabled={likeState.loading || unlikeState.loading}
      className={cn('gap-1.5 px-2 text-micro', comment.likedByMe ? 'text-danger' : 'text-muted')}
      onClick={async () => {
        if (likeState.loading || unlikeState.loading) return;
        try {
          if (comment.likedByMe) {
            await unlike({
              variables: { commentId: id },
              optimisticResponse: {
                unlikePostComment: {
                  __typename: 'PostComment',
                  id,
                  likeCount: Math.max(0, comment.likeCount - 1),
                  likedByMe: false,
                },
              },
            });
            return;
          }
          await like({
            variables: { commentId: id },
            optimisticResponse: {
              likePostComment: {
                __typename: 'PostComment',
                id,
                likeCount: comment.likeCount + 1,
                likedByMe: true,
              },
            },
          });
        } catch {
          /* ErrorLink가 알리고 Apollo가 낙관적 변경을 되돌린다. */
        }
      }}
    >
      {heart}
      {formatCount(comment.likeCount)}
    </Button>
  );
}
