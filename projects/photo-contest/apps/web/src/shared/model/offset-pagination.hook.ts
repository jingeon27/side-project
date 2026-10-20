'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

export function useOffsetPagination({
  count,
  firstId,
  limit,
  fetchPage,
}: {
  count: number;
  firstId?: string;
  limit: number;
  fetchPage: (offset: number) => Promise<number>;
}) {
  const [hasMore, setHasMore] = useState(true);
  const [pending, startTransition] = useTransition();
  const previous = useRef({ firstId, count });
  useEffect(() => {
    if (previous.current.firstId !== firstId || count < previous.current.count) setHasMore(true);
    previous.current = { firstId, count };
  }, [firstId, count]);
  return {
    hasMore: hasMore && count >= limit,
    pending,
    loadMore: () => {
      if (pending || !hasMore) return;
      startTransition(async () => {
        try {
          setHasMore((await fetchPage(count)) === limit);
        } catch {
          /* 조회 경계에서 재시도한다. */
        }
      });
    },
  };
}
