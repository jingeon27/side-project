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
  const activeRequest = useRef<Promise<unknown> | null>(null);

  return {
    ...result,
    hasNextPage: nextOffset !== null,
    isFetchingNextPage,
    fetchNextPage: () => {
      if (nextOffset === null || activeRequest.current) return;
      startTransition(async () => {
        const request = fetchMore({ variables: { offset: nextOffset } });
        activeRequest.current = request;
        try {
          await request;
        } catch {
          /* 조회 오류는 같은 QueryRef의 AsyncBoundary에서 복구한다. */
          return;
        } finally {
          if (activeRequest.current === request) activeRequest.current = null;
        }
        onPageLoaded?.(nextOffset);
      });
    },
    refetch: async () => {
      // 첫 페이지를 다시 받는 동안 이전 페이지 정보로 추가 조회를 보내지 않는다.
      const request = refetch();
      activeRequest.current = request;
      try {
        return await request;
      } finally {
        if (activeRequest.current === request) activeRequest.current = null;
      }
    },
  };
}
