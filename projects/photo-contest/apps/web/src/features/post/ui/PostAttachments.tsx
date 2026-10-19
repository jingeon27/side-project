'use client';

import { PostMedia } from './PostMedia';
import { PostLink } from './PostLink';

export function PostAttachments({ postId, detail = false }: { postId: string; detail?: boolean }) {
  return (
    <>
      <PostMedia postId={postId} detail={detail} />
      <PostLink postId={postId} />
    </>
  );
}
