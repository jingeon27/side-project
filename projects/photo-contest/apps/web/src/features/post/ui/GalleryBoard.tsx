'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { match } from 'ts-pattern';

import { GalleryPostsDocument, PostSort, type GalleryPostsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCard } from './PostCard';

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted">
          {popular ? '이번 달에 올라온 글 · 좋아요순' : '사진·동영상 · 최신순'}
        </p>
        <Button
          variant="ghost"
          size="sm"
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
          새로고침
        </Button>
      </div>
      {match(data.galleryPosts)
        .with([], () => (
          <EmptyState
            title={popular ? '이달의 첫 웃음을 기다려요' : '아직 올라온 게시물이 없어요'}
            description="갤러리에 사진이나 동영상을 올려보세요. 합성도 환영해요."
          />
        ))
        .otherwise((posts) => (
          <div className="grid items-start gap-5 tablet:grid-cols-2 desktop:grid-cols-3" data-photo-feed>
            {posts.map(({ id }) => (
              <PostCard key={id} id={id} />
            ))}
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
    <section className="flex flex-col gap-4" aria-label={popular ? '이달의 인기' : '최신 게시물'}>
      <h2 className="text-title-lg text-ink">{popular ? '이달의 인기' : '최신 게시물'}</h2>
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
        <BoardContent postsRef={postsRef} limit={limit} popular={popular} />
      </AsyncBoundary>
    </section>
  );
}
