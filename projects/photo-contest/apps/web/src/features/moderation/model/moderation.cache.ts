import type { ApolloCache } from '@apollo/client';

import { resetSubmissionFeeds } from '@/features/submission';
import {
  ContestDocument,
  ContestResultsDocument,
  SubmissionsDocument,
  SubmissionVisibilityFragmentDoc,
} from '@/shared/api/generated';

const submissionId = (cache: ApolloCache, id: string) => cache.identify({ __typename: 'Submission', id });

/** 숨긴 사진 표시. 피드는 숨긴 사진을 빼고 그리므로 바로 사라진다. */
export function markSubmissionHidden(cache: ApolloCache, id: string) {
  cache.updateFragment({ id: submissionId(cache, id), fragment: SubmissionVisibilityFragmentDoc }, (data) =>
    data ? { ...data, hidden: true } : data,
  );
  resetSubmissionFeeds(cache);
}

/**
 * 삭제한 사진을 캐시에서 지운다. 피드 목록은 병합 정책 때문에 updateQuery로 빼도 다시 살아나므로 evict로 지운다
 * (목록에 남은 끊어진 참조는 Apollo가 읽을 때 걸러 낸다).
 */
export function evictSubmission(cache: ApolloCache, id: string) {
  cache.evict({ id: submissionId(cache, id) });
  resetSubmissionFeeds(cache);
  cache.gc();
}

/** 숨기기·삭제 뒤 사진 목록·대회 정보·종료 결과를 다시 받는다. */
export function moderationRefetchQueries(contestId: string, isCompleted: boolean) {
  return [
    SubmissionsDocument,
    { query: ContestDocument, variables: { id: contestId } },
    ...(isCompleted ? [{ query: ContestResultsDocument, variables: { contestId } }] : []),
  ];
}
