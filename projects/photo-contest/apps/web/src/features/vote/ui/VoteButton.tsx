'use client';

import { useMutation } from '@apollo/client/react';
import { Check } from 'lucide-react';
import { match } from 'ts-pattern';

import { CastVoteDocument } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { Button } from '@/shared/ui/@core/button';

import { writeVotedSubmission } from '../model/vote.cache';

interface IVoteButtonProps {
  contestId: string;
  submissionId: string;
  /** 대회에서 내가 투표한 사진(없으면 null) */
  votedSubmissionId: string | null;
  isMine: boolean;
  isHidden: boolean;
}

type TVoteState = 'selected' | 'mine' | 'voted' | 'hidden' | 'open';

/**
 * 투표 단계의 사진마다 붙는 버튼. 1인 1표, 내 사진·숨긴 사진에는 투표할 수 없다.
 * 누르는 즉시 "내가 뽑은 사진"으로 바꾸고(낙관적 votedSubmissionId), 서버가 거절하면 Apollo가 되돌린다(안내는 ErrorLink 토스트).
 */
export function VoteButton({
  contestId,
  submissionId,
  votedSubmissionId,
  isMine,
  isHidden,
}: IVoteButtonProps) {
  const [castVote, { loading }] = useMutation(CastVoteDocument, {
    variables: { contestId, submissionId },
    optimisticResponse: {
      castVote: { __typename: 'Vote', id: `optimistic:${submissionId}`, contestId, submissionId },
    },
    update: (cache, { data }) => {
      if (data) writeVotedSubmission(cache, data.castVote.contestId, data.castVote.submissionId);
    },
    onCompleted: () => trackEvent(ANALYTICS_EVENT.VoteCast, { contest_id: contestId }),
  });

  const handleVote = async () => {
    try {
      await castVote();
    } catch {
      // 낙관적 투표는 Apollo가 되돌렸고 안내는 ErrorLink가 했다.
    }
  };

  const state = match({
    selected: votedSubmissionId === submissionId,
    isMine,
    voted: Boolean(votedSubmissionId),
    isHidden,
  })
    .returnType<TVoteState>()
    .with({ selected: true }, () => 'selected')
    .with({ isMine: true }, () => 'mine')
    .with({ voted: true }, () => 'voted')
    .with({ isHidden: true }, () => 'hidden')
    .with({ isHidden: false }, () => 'open')
    .exhaustive();

  return match(state)
    .with('selected', () => (
      <Button variant="primary" size="md" fullWidth disabled>
        <Check aria-hidden className="size-4" />
        내가 뽑은 사진
      </Button>
    ))
    .with('mine', () => (
      <Button variant="secondary" fullWidth disabled>
        내 사진에는 투표할 수 없어요
      </Button>
    ))
    .with('voted', () => (
      <Button variant="secondary" fullWidth disabled>
        투표 완료
      </Button>
    ))
    .with('hidden', () => (
      <Button variant="secondary" fullWidth disabled>
        투표할 수 없는 사진
      </Button>
    ))
    .with('open', () => (
      <Button variant="accent" fullWidth loading={loading} onClick={handleVote}>
        이 사진에 한 표!
      </Button>
    ))
    .exhaustive();
}
