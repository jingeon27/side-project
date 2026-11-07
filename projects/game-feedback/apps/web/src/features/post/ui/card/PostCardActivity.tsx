'use client';

import { ArrowUpRight, MessageSquare } from 'lucide-react';
import { match } from 'ts-pattern';

import { useI18n } from '@/shared/i18n';

import { usePostCard } from './post-card.hook';

/** 답변 수나 상세 보기 안내 */
export function PostCardActivity() {
  const { t } = useI18n();
  const post = usePostCard();
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
