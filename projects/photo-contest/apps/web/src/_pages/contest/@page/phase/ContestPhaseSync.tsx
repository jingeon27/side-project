'use client';

import { skipToken, useQuery, useReadQuery } from '@apollo/client/react';

import { ContestDocument, Phase } from '@/shared/api/generated';

import type { TContestQueryRef } from '../model/contest-query.type';

/** UI를 읽는 Suspense 쿼리와 주기 갱신을 분리한다. 사진 목록은 갱신하지 않는다. */
export function ContestPhaseSync({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  const { error } = useQuery(
    ContestDocument,
    data && data.contest.phase !== Phase.Completed
      ? { variables: { id: data.contest.id }, pollInterval: 30_000 }
      : skipToken,
  );
  if (error) throw error;
  return null;
}
