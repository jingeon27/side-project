'use client';

import { PostLink } from './PostLink';
import { PostMedia } from './PostMedia';

export function PostAttachments({ postId, detail = false }: { postId: string; detail?: boolean }) {
  return (
    <>
      <PostMedia postId={postId} detail={detail} />
      <PostLink postId={postId} />
    </>
  );
}
