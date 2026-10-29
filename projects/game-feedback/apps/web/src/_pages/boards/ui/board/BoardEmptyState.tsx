'use client';

import { match } from 'ts-pattern';

import type { TBoardKind, TFeedbackStatus } from '@game-feedback/contracts';
import { ButtonLink } from '@side/design-system/next';

import { useI18n } from '@/shared/i18n';

interface IBoardEmptyStateProps {
  board?: TBoardKind;
  feedbackStatus?: TFeedbackStatus;
  q: string;
  allFeedbackHref: string;
}
function emptyMessage({ board, feedbackStatus, q }: IBoardEmptyStateProps) {
  if (q) return '일치하는 게시글이 없어요';
  if (board !== 'FEEDBACK') return '아직 게시글이 없어요. 첫 글을 남겨보세요.';
  return match(feedbackStatus)
    .with('WAITING', () => '답변을 기다리는 요청이 없어요.')
    .with('ANSWERED', () => '아직 답변이 달린 요청이 없어요.')
    .with(undefined, () => '아직 피드백 요청이 없어요.')
    .exhaustive();
}
export function BoardEmptyState(props: IBoardEmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="board-empty">
      <p>{t(emptyMessage(props))}</p>
      {props.feedbackStatus && (
        <ButtonLink href={props.allFeedbackHref} variant="secondary" size="sm">
          {t('전체 피드백 보기')}
        </ButtonLink>
      )}
    </div>
  );
}
