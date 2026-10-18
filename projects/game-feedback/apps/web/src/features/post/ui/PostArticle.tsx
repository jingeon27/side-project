'use client';
import { useI18n } from '@/shared/i18n';
import type { ReactNode } from 'react';
import type { Post } from '@/shared/api';
import { Avatar, RichTextBody } from '@/shared/ui';
import { formatDateTime } from '@/shared/lib/date';
import { PostStatus } from './PostStatus';
import { CoachingSummary } from '@/features/coaching';
import { FriendSaleSummary } from '@/features/friend-sale';
import { BattleSummary } from '@/features/battle';
import { boardByKind } from '@/features/board';
interface IPostArticleProps {
  post: Post;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
}
export function PostArticle({ post, authorContent, authorName, actions }: IPostArticleProps) {
  const { t, locale: textLocale } = useI18n();
  const board = boardByKind(post.board);
  const isFeedback = board?.kind === 'FEEDBACK';
  return (
    <article className="detail-card">
      <div className="post-topline">
        {!isFeedback ? (
          <span className="status-pill">{t(board?.name ?? '게시글')}</span>
        ) : (
          <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
        )}
        <span className="post-time">{post.category.name}</span>
      </div>
      <h1>{post.title}</h1>
      <div className="detail-author">
        <Avatar name={post.author.nickname} />
        <div>
          <strong>{authorName ?? post.author.nickname}</strong>
          {authorContent}
          <span suppressHydrationWarning>
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt, textLocale)}</time>
            {post.updatedAt !== post.createdAt && t(' (수정됨)')}
          </span>
        </div>
        {actions}
      </div>
      {post.coaching && <CoachingSummary details={post.coaching} />}
      {post.board === 'FRIEND_SALE' && <FriendSaleSummary details={post.friendSale} />}
      {post.board === 'FRIENDLY' && post.battle && <BattleSummary details={post.battle} />}
      <RichTextBody body={post.body} document={post.document} />
      <dl className="post-publication">
        <div>
          <dt>{t('등록일시')}</dt>
          <dd>
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt, textLocale)}</time>
          </dd>
        </div>
        <div>
          <dt>{t('조회수')}</dt>
          <dd>{post.viewCount.toLocaleString()}</dd>
        </div>
      </dl>
    </article>
  );
}
