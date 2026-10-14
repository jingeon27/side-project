import type { ApolloCache } from '@apollo/client';

import { ContestVoteFragmentDoc } from '@/shared/api/generated';

/** 투표한 사진을 대회에 적는다. 낙관적 응답에도 쓰여 실패하면 Apollo가 이 기록을 걷어 낸다. */
export function writeVotedSubmission(cache: ApolloCache, contestId: string, submissionId: string) {
  cache.updateFragment(
    { id: cache.identify({ __typename: 'Contest', id: contestId }), fragment: ContestVoteFragmentDoc },
    (data) => (data ? { ...data, votedSubmissionId: submissionId } : data),
  );
}
