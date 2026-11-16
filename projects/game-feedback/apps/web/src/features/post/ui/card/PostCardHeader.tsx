'use client';

import type { ReactNode } from 'react';

import { Eye } from 'lucide-react';

import { useI18n } from '@/shared/i18n';
import { formatDateTime, timeAgo } from '@/shared/lib/date';

import { usePostCard } from './post-card.hook';

/** 게시판·상태(children)와 조회수·작성 시각 줄 */
export function PostCardHeader({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const post = usePostCard();
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
