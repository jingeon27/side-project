import type { ApolloCache } from '@apollo/client';

import { ContestDocument } from '@/shared/api/generated';

/** 내 사진을 냈다고 대회에 적는다(제출 버튼을 숨기고 사진 수를 늘린다). 목록은 첫 페이지를 다시 받아 채운다. */
export function markContestSubmitted(cache: ApolloCache, contestId: string, submissionId: string) {
  cache.updateQuery({ query: ContestDocument, variables: { id: contestId } }, (data) =>
    data
      ? {
          contest: {
            ...data.contest,
            mySubmissionId: submissionId,
            submissionCount: data.contest.submissionCount + 1,
          },
        }
      : undefined,
  );
}
