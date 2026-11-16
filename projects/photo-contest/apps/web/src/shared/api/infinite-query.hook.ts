'use client';

import { useTransition } from 'react';

import { NetworkStatus } from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';

import type { useObservableQueryRef } from './observable-query-ref.hook';

/** 서버가 알려준 페이지 범위를 따라 읽고, Apollo의 현재 조회 상태로 추가 요청을 제어한다. */
export function useInfiniteQuery<TData>(
  { observable, fetchMore, ...result }: ReturnType<typeof useObservableQueryRef<TData>>,
  getNextOffset: (data: MaybeMasked<TData>) => number | null,
  onPageLoaded?: (offset: number) => void,
) {
  const [isFetchingNextPage, startTransition] = useTransition();

  return {
    ...result,
    hasNextPage: getNextOffset(result.data) !== null,
    isFetchingNextPage,
    fetchNextPage: () => {
      const current = observable.getCurrentResult();
      if (current.networkStatus !== NetworkStatus.ready || current.dataState !== 'complete') return;
      const nextOffset = getNextOffset(current.data);
      if (nextOffset === null) return;
      startTransition(async () => {
        try {
          await fetchMore({ variables: { offset: nextOffset } });
        } catch {
          /* 조회 오류는 같은 QueryRef의 AsyncBoundary에서 복구한다. */
          return;
        }
        onPageLoaded?.(nextOffset);
      });
    },
  };
}
