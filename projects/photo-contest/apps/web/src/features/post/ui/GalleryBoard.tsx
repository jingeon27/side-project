'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Camera, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
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
  postAction,
}: {
  postsRef: QueryRef<GalleryPostsQuery>;
  limit: number;
  popular: boolean;
  postAction?: (postId: string) => ReactNode;
}) {
  const { fetchMore } = useQueryRefHandlers(postsRef);
  const { data } = useReadQuery(postsRef);
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
      <p className="sr-only">{popular ? '이번 달에 올라온 글 · 좋아요순' : '사진·동영상 · 최신순'}</p>
      {match(data.galleryPosts)
        .with([], () => (
          <EmptyState
            icon={<Camera className="size-6" />}
            title={popular ? '이달의 첫 웃음을 기다려요' : '아직 올라온 게시물이 없어요'}
            description="그룹에 사진이나 동영상을 올려보세요. 합성도 환영해요."
          />
        ))
        .otherwise((posts) => (
          <div
            className={cn('grid min-w-0 grid-cols-1 items-start', popular ? 'gap-4' : 'gap-6')}
            data-photo-feed
          >
            {posts.map(({ id }, index) =>
              popular ? (
                <PopularPostCard key={id} id={id} rank={index + 1} />
              ) : postAction ? (
                <div key={id} className="flex min-w-0 flex-col gap-3">
                  <PostCard id={id} />
                  {postAction(id)}
                </div>
              ) : (
                <PostCard key={id} id={id} />
              ),
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
export function GalleryBoard({
  groupId,
  contestId,
  popular = false,
  postAction,
}: {
  groupId?: string;
  contestId?: string;
  popular?: boolean;
  postAction?: (postId: string) => ReactNode;
}) {
  const limit = popular ? 3 : 24;
  const [postsRef, { refetch }] = useBackgroundQuery(GalleryPostsDocument, {
    variables: {
      groupId: groupId ?? null,
      ...(contestId ? { contestId } : {}),
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
          'flex min-h-touch items-center gap-2 text-subtitle text-ink',
          !popular && 'border-b border-line pb-3',
        )}
      >
        {popular ? <Sparkles aria-hidden className="size-4 text-muted" /> : null}
        {popular ? '이달의 인기' : '최신 게시물'}
      </h2>
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
        <BoardContent postsRef={postsRef} limit={limit} popular={popular} postAction={postAction} />
      </AsyncBoundary>
    </section>
  );
}
