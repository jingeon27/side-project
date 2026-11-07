'use client';

import { boardByKind } from '@/features/board';
import { useI18n } from '@/shared/i18n';

import { PostStatus } from '../PostStatus';
import { usePostCard } from './post-card.hook';

/** 게시판 이름과 피드백 글의 답변 상태 */
export function PostCardBoard({ showLabel = true }: { showLabel?: boolean }) {
  const { t } = useI18n();
  const post = usePostCard();
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
