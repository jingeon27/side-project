'use client';

import { PostLink } from './PostLink';
import { PostMedia } from './PostMedia';

/** 카드 밖(댓글 시트의 원본 게시물)에서 미디어와 첨부 링크를 함께 보여 준다. */
export function PostAttachments({ postId, detail = false }: { postId: string; detail?: boolean }) {
  return (
    <>
      <PostMedia postId={postId} detail={detail} />
      <PostLink postId={postId} />
    </>
  );
}
