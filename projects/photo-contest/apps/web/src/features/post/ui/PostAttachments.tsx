'use client';

import { PostLink } from './PostLink';
import { PostMedia } from './PostMedia';

export function PostAttachments({
  postId,
  detail = false,
  edgeToEdge = false,
}: {
  postId: string;
  detail?: boolean;
  edgeToEdge?: boolean;
}) {
  return (
    <>
      <div className={edgeToEdge ? '-mx-4 desktop:-mx-5' : 'contents'}>
        <PostMedia postId={postId} detail={detail} edgeToEdge={edgeToEdge} />
      </div>
      <PostLink postId={postId} />
    </>
  );
}
