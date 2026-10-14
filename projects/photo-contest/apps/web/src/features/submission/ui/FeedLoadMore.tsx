'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

import { Button } from '@/shared/ui/@core/button';

interface IFeedLoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * 끝에 가까워지면 다음 사진을 불러오는 감시 지점과, 같은 일을 하는 "사진 더 보기" 버튼.
 * 버튼은 화면 읽기 프로그램·키보드 사용자와 IntersectionObserver가 없는 환경을 위해 남긴다.
 */
export function FeedLoadMore({ hasMore, loading, onLoadMore }: IFeedLoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef({ loading, onLoadMore });
  useLayoutEffect(() => {
    latest.current = { loading, onLoadMore };
  });

  useEffect(() => {
    const target = sentinel.current;
    if (!hasMore || !target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !latest.current.loading)
          latest.current.onLoadMore();
      },
      // 한 화면쯤 남았을 때 미리 불러온다.
      { rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore]);

  if (!hasMore) return null;
  return (
    <div className="flex flex-col items-stretch">
      <div ref={sentinel} aria-hidden className="h-px" />
      <Button variant="secondary" fullWidth loading={loading} onClick={onLoadMore}>
        사진 더 보기
      </Button>
    </div>
  );
}
