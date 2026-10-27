'use client';

import { useFragment, useMutation } from '@apollo/client/react';

import {
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  LikePostDocument,
  UnlikePostDocument,
} from '@/shared/api/generated';
import { formatCount } from '@/shared/lib/format.helper';
import { useHaptics } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { LikeToggle } from '@/shared/ui/@core/like-toggle';

import { refreshMonthlyPopular } from '../model/post.cache';

/**
 * 게시물 좋아요 토글. 누르는 즉시 수와 하트를 바꾸고(낙관적 응답) 서버가 거절하면 Apollo가 되돌린다.
 * 이달의 인기 순위는 서버가 다시 매기므로 그 목록만 뒤에서 다시 받고 버튼은 기다리지 않는다.
 */
export function PostLikeButton({ postId }: { postId: string }) {
  const haptics = useHaptics();
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const [like, likeState] = useMutation(LikePostDocument, {
    refetchQueries: [GalleryPostsDocument],
    onQueryUpdated: refreshMonthlyPopular,
    onCompleted: () => haptics.impact('light'),
  });
  const [unlike, unlikeState] = useMutation(UnlikePostDocument, {
    refetchQueries: [GalleryPostsDocument],
    onQueryUpdated: refreshMonthlyPopular,
  });
  if (!complete) return null;
  const pending = likeState.loading || unlikeState.loading;
  return (
    <LikeToggle
      density="card"
      liked={post.likedByMe}
      label={`${post.title} 좋아요`}
      onClick={async () => {
        if (!post.canInteract) {
          toast.info('그룹에 가입하면 좋아요를 남길 수 있어요.');
          return;
        }
        // 응답을 기다리는 동안 다시 누르면 낙관적 값이 겹쳐 수가 어긋난다.
        if (pending) return;
        try {
          if (post.likedByMe) {
            await unlike({
              variables: { postId },
              optimisticResponse: {
                unlikePost: {
                  __typename: 'GalleryPost',
                  id: postId,
                  likeCount: Math.max(0, post.likeCount - 1),
                  likedByMe: false,
                },
              },
            });
            return;
          }
          await like({
            variables: { postId },
            optimisticResponse: {
              likePost: {
                __typename: 'GalleryPost',
                id: postId,
                likeCount: post.likeCount + 1,
                likedByMe: true,
              },
            },
          });
        } catch {
          /* ErrorLink가 알리고 Apollo가 낙관적 변경을 되돌린다. */
        }
      }}
    >
      좋아요 {formatCount(post.likeCount)}개
    </LikeToggle>
  );
}
