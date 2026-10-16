import type { ReactNode } from 'react';
import type { Comment } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
interface ICommentItemProps {
  comment: Comment;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
}
export function CommentItem({ comment, authorContent, authorName, actions }: ICommentItemProps) {
  return (
    <article className="comment">
      <Avatar name={comment.author.nickname} size="small" />
      <div className="comment-content">
        <div className="comment-heading">
          <strong>{authorName ?? comment.author.nickname}</strong>
          {authorContent}
          <span className="small muted">{timeAgo(comment.createdAt)}</span>
        </div>
        <p>{comment.body}</p>
        {actions}
      </div>
    </article>
  );
}
