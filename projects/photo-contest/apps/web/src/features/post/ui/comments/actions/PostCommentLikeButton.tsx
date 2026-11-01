'use client';

import { useFragment, useMutation } from '@apollo/client/react';

import {
  LikePostCommentDocument,
  PostCommentCardFragmentDoc,
  UnlikePostCommentDocument,
} from '@/shared/api/generated';
import { formatCount } from '@/shared/lib/format.helper';
import { LikeCount, LikeToggle } from '@/shared/ui/@core/like-toggle';

export function PostCommentLikeButton({ id }: { id: string }) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id },
  });
  const [like, likeState] = useMutation(LikePostCommentDocument);
  const [unlike, unlikeState] = useMutation(UnlikePostCommentDocument);
  if (!complete) return null;
  const label = `댓글 좋아요 ${formatCount(comment.likeCount)}개`;
  if (!comment.canInteract)
    return (
      <LikeCount density="inline" liked={comment.likedByMe} label={label}>
        {formatCount(comment.likeCount)}
      </LikeCount>
    );

  return (
    <LikeToggle
      density="inline"
      liked={comment.likedByMe}
      label={label}
      disabled={likeState.loading || unlikeState.loading}
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
      {formatCount(comment.likeCount)}
    </LikeToggle>
  );
}
