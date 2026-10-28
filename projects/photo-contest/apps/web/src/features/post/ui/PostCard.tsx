'use client';

import { PostActionsMenu } from './PostActionsMenu';
import { PostCardFrame } from './PostCardFrame';
import { PostCommentButton } from './PostCommentButton';
import { PostLikeButton } from './PostLikeButton';

/** 그룹 멤버가 보는 게시물 카드. 수정·숨기기·삭제 메뉴와 좋아요·댓글을 둔다. */
export function PostCard({ id }: { id: string }) {
  return (
    <PostCardFrame
      id={id}
      menu={<PostActionsMenu postId={id} />}
      actions={
        <>
          <PostLikeButton postId={id} />
          <PostCommentButton postId={id} />
        </>
      }
    />
  );
}
