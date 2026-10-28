'use client';

import type { ReactNode } from 'react';

import { Mention } from '@side/design-system';

import type { Comment } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { timeAgo } from '@/shared/lib/date';
import { useIsSSR } from '@/shared/lib/use-is-ssr';
import { Avatar } from '@/shared/ui';

interface ICommentItemProps {
  comment: Comment;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
  isPostAuthor?: boolean;
  mine: boolean;
  replyToName?: string;
}

export function CommentItem({
  comment,
  authorContent,
  authorName,
  actions,
  isPostAuthor,
  mine,
  replyToName,
}: ICommentItemProps) {
  const isSSR = useIsSSR();
  const { t, locale: textLocale } = useI18n();
  if (comment.isDeleted || !comment.author)
    return (
      <article id={`comment-${comment.id}`} className="comment comment-deleted">
        <p>{t('삭제된 댓글이에요.')}</p>
      </article>
    );
  return (
    <article id={`comment-${comment.id}`} className="comment" data-mine={mine || undefined}>
      {!mine && <Avatar src={comment.author.avatarUrl} name={comment.author.nickname} size="small" />}
      <div className="comment-content">
        <div className="comment-heading">
          <strong>{authorName ?? comment.author.nickname}</strong>
          {isPostAuthor && <span className="comment-author-label">{t('작성자')}</span>}
          {authorContent}
        </div>
        <p className="comment-bubble">
          {replyToName && (
            <>
              <Mention nickname={replyToName} />{' '}
            </>
          )}
          {comment.body}
        </p>
        <div className="comment-meta">
          <time dateTime={comment.createdAt}>
            {isSSR
              ? new Date(comment.createdAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
              : timeAgo(comment.createdAt, textLocale)}
          </time>
          {comment.updatedAt !== comment.createdAt && <span>{t(' (수정됨)')}</span>}
        </div>
        {actions}
      </div>
    </article>
  );
}
