import type { ApolloCache } from '@apollo/client';

import { resetPhotoFeed } from '@/features/feed';
import { ContestDocument } from '@/shared/api/generated';

/** 사진이 빠지면 offset 위치가 밀리므로 목록을 처음부터 다시 받는다. */
export function resetSubmissionFeeds(cache: ApolloCache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'submissions' });
  resetPhotoFeed(cache);
}

/** 내 사진을 냈다고 대회에 적는다(제출 버튼을 숨기고 사진 수를 늘린다). 목록은 첫 페이지를 다시 받아 채운다. */
export function markContestSubmitted(cache: ApolloCache, contestId: string, submissionId: string) {
  resetPhotoFeed(cache);
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
