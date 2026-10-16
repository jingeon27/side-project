'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Camera, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { match } from 'ts-pattern';

import { GalleryPostsDocument, PostSort, type GalleryPostsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { cn } from '@/shared/lib/cn.helper';

import { PostCard } from './PostCard';
import { PopularPostCard } from './PopularPostCard';

function BoardContent({
  postsRef,
  limit,
  popular,
}: {
  postsRef: QueryRef<GalleryPostsQuery>;
  limit: number;
  popular: boolean;
}) {
  const { data } = useReadQuery(postsRef);
  const { fetchMore, refetch } = useQueryRefHandlers(postsRef);
  const [hasMore, setHasMore] = useState(true);
  const [pending, startTransition] = useTransition();
  const firstId = data.galleryPosts[0]?.id;
  const previous = useRef({ firstId, count: data.galleryPosts.length });
  useEffect(() => {
    if (previous.current.firstId !== firstId || data.galleryPosts.length < previous.current.count)
      setHasMore(true);
    previous.current = { firstId, count: data.galleryPosts.length };
  }, [firstId, data.galleryPosts.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="absolute top-0 right-0 flex items-center">
        <p className="sr-only">{popular ? '이번 달에 올라온 글 · 좋아요순' : '사진·동영상 · 최신순'}</p>
        <Button
          variant="ghost"
          size="md"
          className="px-2"
          onClick={() =>
            startTransition(async () => {
              try {
                await refetch();
                setHasMore(true);
              } catch {
                /* 경계에서 재시도한다. */
              }
            })
          }
          loading={pending}
        >
          <RefreshCw aria-hidden className="size-4" />
          <span className={popular ? 'sr-only' : undefined}>새로고침</span>
        </Button>
      </div>
      {match(data.galleryPosts)
        .with([], () => (
          <EmptyState
            icon={<Camera className="size-6" />}
            title={popular ? '이달의 첫 웃음을 기다려요' : '아직 올라온 게시물이 없어요'}
            description="갤러리에 사진이나 동영상을 올려보세요. 합성도 환영해요."
          />
        ))
        .otherwise((posts) => (
          <div
            className={cn(
              'grid min-w-0 items-start',
              popular ? 'grid-cols-3 gap-3 desktop:grid-cols-1 desktop:gap-5' : 'grid-cols-1 gap-6',
            )}
            data-photo-feed
          >
            {posts.map(({ id }, index) =>
              popular ? <PopularPostCard key={id} id={id} rank={index + 1} /> : <PostCard key={id} id={id} />,
            )}
          </div>
        ))}
      {!popular && hasMore && data.galleryPosts.length >= limit ? (
        <Button
          variant="secondary"
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await fetchMore({ variables: { offset: data.galleryPosts.length } });
                setHasMore(result.data.galleryPosts.length === limit);
              } catch {
                /* 경계에서 재시도한다. */
              }
            })
          }
          loading={pending}
        >
          게시물 더 보기
        </Button>
      ) : null}
    </div>
  );
}
export function GalleryBoard({ groupId, popular = false }: { groupId?: string; popular?: boolean }) {
  const limit = popular ? 3 : 24;
  const [postsRef, { refetch }] = useBackgroundQuery(GalleryPostsDocument, {
    variables: {
      groupId: groupId ?? null,
      sort: popular ? PostSort.MonthlyPopular : PostSort.Newest,
      offset: 0,
      limit,
    },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <section
      className="relative flex min-w-0 flex-col gap-3"
      aria-label={popular ? '이달의 인기' : '최신 게시물'}
    >
      <h2
        className={cn(
          'flex min-h-touch items-center gap-2 pr-28 text-subtitle text-ink',
          popular ? 'pr-12' : 'border-b border-line pb-3',
        )}
      >
        {popular ? <Sparkles aria-hidden className="size-4 text-muted" /> : null}
        {popular ? '이달의 인기' : '최신 게시물'}
      </h2>
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
        <BoardContent postsRef={postsRef} limit={limit} popular={popular} />
      </AsyncBoundary>
    </section>
  );
}
