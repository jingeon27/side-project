'use client';
import { useI18n } from '@/shared/i18n';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Eye, MessageSquare } from 'lucide-react';
import type { Post } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { formatDateTime, timeAgo } from '@/shared/lib/date';
import { m, useMotionPreference } from '@/shared/motion';
import { PostStatus } from './PostStatus';
import { CoachingSummary } from '@/features/coaching';
import { FriendSaleSummary } from '@/features/friend-sale';
import { boardByKind } from '@/features/board';
interface IPostCardProps {
  post: Post;
  href: string;
  authorContent?: ReactNode;
  authorName?: ReactNode;
}
export function PostCard({ post, href, authorContent, authorName }: IPostCardProps) {
  const { t, locale: textLocale } = useI18n();
  const reducedMotion = useMotionPreference();
  const board = boardByKind(post.board);
  const isFeedback = board?.kind === 'FEEDBACK';
  return (
    <m.article
      className="post-card"
      initial={false}
      animate={{ y: 0, opacity: 1 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
    >
      <div className="post-topline">
        <div className="post-board-status">
          <span className="small muted">{t(board?.name ?? '피드백')}</span>
          {isFeedback && <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />}
        </div>
        <div className="post-metadata">
          <span className="post-views">
            <Eye size={13} aria-hidden="true" />
            {t('조회 {count}', { count: post.viewCount })}
          </span>
          <time
            className="post-time"
            dateTime={post.createdAt}
            title={formatDateTime(post.createdAt, textLocale)}
            suppressHydrationWarning
          >
            {timeAgo(post.createdAt, textLocale)}
          </time>
        </div>
      </div>
      <Link href={href} className="post-title-link">
        <h3>{post.title}</h3>
      </Link>
      <p className="post-excerpt">{post.body}</p>
      {post.coaching && <CoachingSummary details={post.coaching} />}
      {post.board === 'FRIEND_SALE' && <FriendSaleSummary details={post.friendSale} />}
      <div className="post-bottom">
        <span className="post-author">
          <Avatar name={post.author.nickname} size="small" />
          <strong>{authorName ?? post.author.nickname}</strong>
          {authorContent}
          <span className="post-author-game">{post.category.name}</span>
        </span>
        <span className={`answer-count ${post.answerCount > 0 ? 'has-answers' : ''}`}>
          <MessageSquare size={15} />
          {t(post.board === 'COACHING' ? '코칭 보기' : isFeedback ? '피드백' : '게시글 보기')}
          {isFeedback && <strong>{post.answerCount}</strong>}
          <ArrowUpRight size={15} />
        </span>
      </div>
    </m.article>
  );
}
