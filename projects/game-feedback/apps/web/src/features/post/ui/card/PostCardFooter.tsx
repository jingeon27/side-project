'use client';

import type { ReactNode } from 'react';

import { ArrowUpRight, MessageSquare } from 'lucide-react';
import { match } from 'ts-pattern';

import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { Avatar } from '@/shared/ui';

export function PostCardFooter({
  post,
  authorName,
  authorContent,
  children,
}: {
  post: Pick<Post, 'author' | 'category'>;
  authorName?: ReactNode;
  authorContent?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="post-bottom">
      <span className="post-author">
        <Avatar src={post.author.avatarUrl} name={post.author.nickname} size="small" />
        <strong>{authorName ?? post.author.nickname}</strong>
        {authorContent}
        <span className="post-author-game">{post.category.name}</span>
      </span>
      {children}
    </div>
  );
}

export function PostCardActivity({ post }: { post: Pick<Post, 'board' | 'answerCount'> }) {
  const { t } = useI18n();
  const label = match(post.board)
    .with('COACHING', () => t('코칭 보기'))
    .with('FEEDBACK', undefined, () => t('답변'))
    .with('FRIEND_SALE', 'FRIENDLY', 'FREE', () => t('게시글 보기'))
    .exhaustive();
  return (
    <span className="answer-count" data-has-answers={post.answerCount > 0 || undefined}>
      <MessageSquare size={15} />
      {label}
      {(post.board === 'FEEDBACK' || post.board === undefined) && <strong>{post.answerCount}</strong>}
      <ArrowUpRight size={15} />
    </span>
  );
}
