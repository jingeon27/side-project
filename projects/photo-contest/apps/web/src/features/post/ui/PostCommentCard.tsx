'use client';

import { PostCommentReplySection } from './PostCommentReplySection';
import { PostCommentRow } from './PostCommentRow';

export function PostCommentCard({ id }: { id: string }) {
  return (
    <li className="min-w-0">
      <PostCommentRow id={id} />
      <PostCommentReplySection parentId={id} />
    </li>
  );
}
