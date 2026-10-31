'use client';

import type { ReactNode } from 'react';

import { Eye } from 'lucide-react';

import { boardByKind } from '@/features/board';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { formatDateTime, timeAgo } from '@/shared/lib/date';

import { PostStatus } from '../PostStatus';

export function PostCardHeader({
  post,
  children,
}: {
  post: Pick<Post, 'createdAt' | 'viewCount'>;
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="post-topline">
      <div className="post-board-status">{children}</div>
      <div className="post-metadata">
        <span className="post-views">
          <Eye size={13} aria-hidden="true" />
          {t('조회 {count}', { count: post.viewCount })}
        </span>
        <time
          className="post-time"
          dateTime={post.createdAt}
          title={formatDateTime(post.createdAt, locale)}
          suppressHydrationWarning
        >
          {timeAgo(post.createdAt, locale)}
        </time>
      </div>
    </div>
  );
}

export function PostCardBoard({
  post,
  showLabel = true,
}: {
  post: Pick<Post, 'board' | 'answerCount' | 'helpfulCount'>;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const board = boardByKind(post.board);
  return (
    <>
      {showLabel && <span className="small muted">{t(board?.name ?? '피드백')}</span>}
      {(post.board === 'FEEDBACK' || post.board === undefined) && (
        <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
      )}
    </>
  );
}
