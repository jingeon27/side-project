'use client';

import { PostCommentButton } from '../actions/PostCommentButton';
import { PostLikeButton } from '../actions/PostLikeButton';
import { PostActionsMenu } from './PostActionsMenu';
import { PostCardFrame } from './PostCardFrame';

/** 그룹 멤버가 보는 게시물 카드. 수정·숨기기·삭제 메뉴와 좋아요·댓글을 둔다. */
export function PostCard({ id, isPriority = false }: { id: string; isPriority?: boolean }) {
  return (
    <PostCardFrame
      id={id}
      isPriority={isPriority}
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
