'use client';

import { useCallback, useContext } from 'react';

import { PullToRefreshPendingContext } from '../pull-to-refresh/pull-to-refresh.context';
import { Spinner } from '../spinner';

interface IFeedLoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  loadingLabel: string;
  onLoadMore: () => void;
}

/**
 * 목록 끝이 가까워지면 다음 페이지를 불러온다. 불러오는 동안 감시를 멈췄다가 끝나면 다시 붙여,
 * 새 페이지가 짧아 끝 지점이 계속 보여도 첫 관찰 결과로 이어서 불러온다.
 */
export function FeedLoadMore({ hasMore, loading, loadingLabel, onLoadMore }: IFeedLoadMoreProps) {
  const refreshing = useContext(PullToRefreshPendingContext);
  const observeEnd = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || loading || refreshing) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
        },
        // 한 화면쯤 남았을 때 미리 불러온다.
        { rootMargin: '0px 0px 600px 0px' },
      );
      observer.observe(node);
      return () => {
        observer.disconnect();
        observer.takeRecords();
      };
    },
    [loading, refreshing, onLoadMore],
  );

  if (!hasMore) return null;
  return (
    <div ref={observeEnd} className="flex min-h-touch items-center justify-center">
      {loading ? <Spinner label={loadingLabel} className="text-muted" /> : null}
    </div>
  );
}
