'use client';

import { useRef, useState, useTransition } from 'react';

import type { MaybeMasked } from '@apollo/client/masking';
import { useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';

interface IInfiniteQueryOptions<TData, TItem extends { id: string }> {
  select: (data: MaybeMasked<TData>) => readonly TItem[];
  pageSize: number;
  canFetchMore?: (data: MaybeMasked<TData>) => boolean;
}

interface ILastPage<TData> {
  queryRef: QueryRef<TData>;
  firstId?: string;
  count: number;
  hasNextPage: boolean;
}

/** 데이터는 Apollo 캐시에서 읽고, 추가 조회의 끝과 동시 요청만 관리한다. */
export function useInfiniteQuery<TData, TItem extends { id: string }>(
  queryRef: QueryRef<TData>,
  { select, pageSize, canFetchMore }: IInfiniteQueryOptions<TData, TItem>,
) {
  const { fetchMore, refetch } = useQueryRefHandlers(queryRef);
  const result = useReadQuery(queryRef);
  const items = select(result.data);
  const [lastPage, setLastPage] = useState<ILastPage<TData> | null>(null);
  const [isFetchingNextPage, startTransition] = useTransition();
  const activeRequest = useRef<Promise<unknown> | null>(null);
  const sameList =
    lastPage?.queryRef === queryRef && lastPage.firstId === items[0]?.id && lastPage.count === items.length;
  const hasNextPage =
    items.length >= pageSize && (!sameList || lastPage.hasNextPage) && (canFetchMore?.(result.data) ?? true);

  return {
    ...result,
    items,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage: () => {
      if (!hasNextPage || activeRequest.current) return;
      startTransition(async () => {
        const request = fetchMore({ variables: { offset: items.length } });
        activeRequest.current = request;
        try {
          const next = await request;
          const page = select(next.data);
          setLastPage({
            queryRef,
            firstId: items[0]?.id,
            count: items.length + page.length,
            hasNextPage: page.length >= pageSize,
          });
        } catch {
          /* 조회 오류는 같은 QueryRef의 AsyncBoundary에서 복구한다. */
        } finally {
          if (activeRequest.current === request) activeRequest.current = null;
        }
      });
    },
    refetch: () => {
      setLastPage(null);
      return refetch();
    },
  };
}
