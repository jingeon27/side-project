'use client';

import { PostCommentReplySection } from './PostCommentReplySection';
import { PostCommentRow } from './PostCommentRow';

export function PostCommentCard({
  id,
  viewerId,
  postAuthorId,
}: {
  id: string;
  viewerId?: string;
  postAuthorId?: string;
}) {
  return (
    <li className="min-w-0">
      <PostCommentRow id={id} viewerId={viewerId} postAuthorId={postAuthorId} />
      <PostCommentReplySection parentId={id} viewerId={viewerId} postAuthorId={postAuthorId} />
    </li>
  );
}
