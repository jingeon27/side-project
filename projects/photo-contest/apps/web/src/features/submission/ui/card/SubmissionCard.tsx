'use client';

import { useId, useMemo, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn.helper';

import { SubmissionCardContext, type TCardSubmission } from './submission-card.hook';

/**
 * 사진 카드(전체 폭 1열). 화면이 사진·본문·캡션·행동 줄을 골라 조합하고 기능 버튼은 기능 slice에서 넣는다.
 * 숨김·우승 표시와 캡션 제목 연결은 카드가 소유한다.
 */
export function SubmissionCard({
  submission,
  isWinner = false,
  children,
}: {
  submission: TCardSubmission;
  /** 결과 화면의 우승작. 카드를 강조하고 data-winner를 붙인다. */
  isWinner?: boolean;
  children: ReactNode;
}) {
  const captionId = useId();
  const context = useMemo(() => ({ submission, captionId }), [submission, captionId]);
  return (
    <SubmissionCardContext value={context}>
      <article
        aria-labelledby={captionId}
        data-winner={isWinner || undefined}
        data-hidden={submission.hidden || undefined}
        className={cn(
          'overflow-hidden rounded-card border border-line bg-surface shadow-card',
          isWinner && 'border-2 border-gold shadow-sheet',
          submission.hidden && 'opacity-80',
        )}
      >
        {children}
      </article>
    </SubmissionCardContext>
  );
}
