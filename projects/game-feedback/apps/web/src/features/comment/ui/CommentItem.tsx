'use client';
import { useI18n } from '@/shared/i18n';
import { useSyncExternalStore, type ReactNode } from 'react';
import type { Comment } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
interface ICommentItemProps {
  comment: Comment;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
  isPostAuthor?: boolean;
  mine: boolean;
}
const subscribeHydration = () => () => undefined;
const clientHydrated = () => true;
const serverHydrated = () => false;

export function CommentItem({
  comment,
  authorContent,
  authorName,
  actions,
  isPostAuthor,
  mine,
}: ICommentItemProps) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const { t, locale: textLocale } = useI18n();
  return (
    <article className={`comment${mine ? ' mine' : ''}`}>
      {!mine && <Avatar src={comment.author.avatarUrl} name={comment.author.nickname} size="small" />}
      <div className="comment-content">
        <div className="comment-heading">
          <strong>{authorName ?? comment.author.nickname}</strong>
          {isPostAuthor && <span className="comment-author-label">{t('작성자')}</span>}
          {authorContent}
        </div>
        <p className="comment-bubble">{comment.body}</p>
        <div className="comment-meta">
          <time dateTime={comment.createdAt}>
            {hydrated
              ? timeAgo(comment.createdAt, textLocale)
              : new Date(comment.createdAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'}
          </time>
          {comment.updatedAt !== comment.createdAt && <span>{t(' (수정됨)')}</span>}
        </div>
        {actions}
      </div>
    </article>
  );
}
