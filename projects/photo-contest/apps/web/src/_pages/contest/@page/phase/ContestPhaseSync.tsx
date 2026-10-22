'use client';

import { skipToken, useQuery, useReadQuery } from '@apollo/client/react';

import { ContestDocument, Phase } from '@/shared/api/generated';

import type { TContestQueryRef } from '../model/contest-query.type';

/**
 * UI를 읽는 Suspense 쿼리와 주기 갱신을 분리한다. 사진 목록은 갱신하지 않는다.
 * 갱신 한 번이 실패해도 보던 화면을 유지하고 다음 주기에 다시 받는다(오류를 던지면 화면 전체가 오류 경계로 바뀐다).
 */
export function ContestPhaseSync({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  useQuery(
    ContestDocument,
    data && data.contest.phase !== Phase.Completed
      ? {
          variables: { id: data.contest.id },
          pollInterval: 30_000,
          errorPolicy: 'all',
          notifyOnNetworkStatusChange: false,
        }
      : skipToken,
  );
  return null;
}
