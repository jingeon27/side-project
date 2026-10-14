'use client';

import { useMutation } from '@apollo/client/react';
import { Heart } from 'lucide-react';
import { useId } from 'react';

import { LikeSubmissionDocument, UnlikeSubmissionDocument } from '@/shared/api/generated';
import type { SubmissionLikeFragment } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { formatCount } from '@/shared/lib/format.helper';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useHaptics } from '@/shared/model/bridge';
import { Button } from '@/shared/ui/@core/button';

interface ILikeButtonProps {
  submission: Omit<SubmissionLikeFragment, '__typename'> & { contestId: string };
  /** 내 사진에는 좋아요를 누를 수 없다(수만 보여 준다). */
  isMine: boolean;
}

/**
 * 하트 토글 + 좋아요 수(모든 단계에서 공개). 누르는 즉시 수와 하트를 바꾸고(낙관적 응답), 서버가 거절하면 Apollo가 되돌린다.
 * 응답은 바뀐 Submission이라 정규화 캐시로 피드·결과에 함께 반영된다. 앱이면 좋아요가 성공했을 때 가볍게 진동한다.
 */
export function LikeButton({ submission, isMine }: ILikeButtonProps) {
  const hintId = useId();
  const haptics = useHaptics();
  const { id, contestId, likeCount, likedByMe } = submission;
  const [likeSubmission, likeState] = useMutation(LikeSubmissionDocument, {
    variables: { submissionId: id },
    optimisticResponse: {
      likeSubmission: { __typename: 'Submission', id, likeCount: likeCount + 1, likedByMe: true },
    },
    onCompleted: () => {
      haptics.impact('light');
      trackEvent(ANALYTICS_EVENT.PhotoLiked, { contest_id: contestId, submission_id: id });
    },
  });
  const [unlikeSubmission, unlikeState] = useMutation(UnlikeSubmissionDocument, {
    variables: { submissionId: id },
    optimisticResponse: {
      unlikeSubmission: { __typename: 'Submission', id, likeCount: Math.max(0, likeCount - 1), likedByMe: false },
    },
    onCompleted: () => trackEvent(ANALYTICS_EVENT.PhotoUnliked, { contest_id: contestId, submission_id: id }),
  });
  const isPending = likeState.loading || unlikeState.loading;

  const handleToggle = async () => {
    // 응답을 기다리는 동안 다시 누르면 낙관적 값이 겹쳐 수가 어긋난다.
    if (isPending) return;
    try {
      await (likedByMe ? unlikeSubmission() : likeSubmission());
    } catch {
      // 낙관적 값은 Apollo가 되돌렸고 안내는 ErrorLink가 했다.
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={likedByMe}
        aria-label={`좋아요 ${formatCount(likeCount)}개`}
        aria-describedby={isMine ? hintId : undefined}
        aria-busy={isPending || undefined}
        disabled={isMine}
        onClick={handleToggle}
        className={cn('gap-1.5 rounded-full px-2.5', likedByMe ? 'text-danger' : 'text-ink')}
      >
        <Heart aria-hidden className={cn('size-5', likedByMe && 'fill-current')} />
        <span aria-hidden className="tabular-nums">
          {formatCount(likeCount)}
        </span>
      </Button>
      {isMine ? (
        <span id={hintId} className="text-caption text-muted">
          내 사진에는 좋아요를 누를 수 없어요
        </span>
      ) : null}
    </>
  );
}
