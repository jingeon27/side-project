'use client';

import { useRef, useTransition } from 'react';

import type { MaybeMasked } from '@apollo/client/masking';
import { useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';

/** 서버가 알려준 페이지 범위를 따라 읽고, 같은 목록의 동시 요청을 막는다. */
export function useInfiniteQuery<TData>(
  queryRef: QueryRef<TData>,
  getNextOffset: (data: MaybeMasked<TData>) => number | null,
  onPageLoaded?: (offset: number) => void,
) {
  const { fetchMore, refetch } = useQueryRefHandlers(queryRef);
  const result = useReadQuery(queryRef);
  const nextOffset = getNextOffset(result.data);
  const [isFetchingNextPage, startTransition] = useTransition();
  // 새로고침과 추가 조회가 겹칠 수 있어, 먼저 끝난 요청이 남은 요청의 잠금을 풀지 않도록 모두 기록한다.
  const activeRequests = useRef(new Set<Promise<unknown>>());
  const track = async <T>(request: Promise<T>) => {
    activeRequests.current.add(request);
    try {
      return await request;
    } finally {
      activeRequests.current.delete(request);
    }
  };

  return {
    ...result,
    hasNextPage: nextOffset !== null,
    isFetchingNextPage,
    fetchNextPage: () => {
      if (nextOffset === null || activeRequests.current.size) return;
      startTransition(async () => {
        try {
          await track(fetchMore({ variables: { offset: nextOffset } }));
        } catch {
          /* 조회 오류는 같은 QueryRef의 AsyncBoundary에서 복구한다. */
          return;
        }
        onPageLoaded?.(nextOffset);
      });
    },
    // 첫 페이지를 다시 받는 동안 이전 페이지 정보로 추가 조회를 보내지 않는다.
    refetch: () => track(refetch()),
  };
}
