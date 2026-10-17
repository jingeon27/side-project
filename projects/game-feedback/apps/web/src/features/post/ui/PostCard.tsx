'use client';
import { useI18n } from '@/shared/i18n';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Trophy, ArrowUpRight, MessageSquare } from 'lucide-react';
import type { Post } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
import { m, useMotionPreference } from '@/shared/motion';
import { PostStatus } from './PostStatus';
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
  return (
    <m.article
      className="post-card"
      initial={false}
      animate={{ y: 0, opacity: 1 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
    >
      <div className="post-topline">
        {board ? (
          <span className="status-pill">{t(board.name)}</span>
        ) : (
          <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
        )}
        <span className="post-time">{timeAgo(post.createdAt, textLocale)}</span>
      </div>
      <Link href={href} className="post-title-link">
        <h3>{post.title}</h3>
      </Link>
      <p className="post-excerpt">{post.body}</p>
      {post.gameProfile && (
        <div className="post-game-info">
          <div className="post-game-stat">
            <Trophy size={14} />
            <span>{post.gameProfile.trophies.toLocaleString()}</span>
            <span className="info-divider" />
            <span>{post.gameProfile.arena}</span>
          </div>
        </div>
      )}
      <div className="post-bottom">
        <span className="post-author">
          <Avatar name={post.author.nickname} size="small" />
          <strong>{authorName ?? post.author.nickname}</strong>
          {authorContent}
          <span className="post-author-game">{t('클래시 로얄')}</span>
        </span>
        <span className={`answer-count ${post.answerCount > 0 ? 'has-answers' : ''}`}>
          <MessageSquare size={15} />
          {t(board ? '게시글 보기' : '피드백')}
          {!board && <strong>{post.answerCount}</strong>}
          <ArrowUpRight size={15} />
        </span>
      </div>
    </m.article>
  );
}
