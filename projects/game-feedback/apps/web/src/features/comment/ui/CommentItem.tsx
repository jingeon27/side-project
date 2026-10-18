'use client';
import { useI18n } from '@/shared/i18n';
import type { ReactNode } from 'react';
import type { Comment } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
interface ICommentItemProps {
  comment: Comment;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
  isPostAuthor?: boolean;
}
export function CommentItem({
  comment,
  authorContent,
  authorName,
  actions,
  isPostAuthor,
}: ICommentItemProps) {
  const { t, locale: textLocale } = useI18n();
  return (
    <article className="comment">
      <Avatar name={comment.author.nickname} size="small" />
      <div className="comment-content">
        <div className="comment-heading">
          <strong>{authorName ?? comment.author.nickname}</strong>
          {isPostAuthor && <span className="comment-author-label">{t('작성자')}</span>}
          {authorContent}
        </div>
        <div className="comment-meta" suppressHydrationWarning>
          <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt, textLocale)}</time>
          {comment.updatedAt !== comment.createdAt && <span>{t(' (수정됨)')}</span>}
        </div>
        <p>{comment.body}</p>
        {actions}
      </div>
    </article>
  );
}
