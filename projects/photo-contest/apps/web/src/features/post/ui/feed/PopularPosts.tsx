'use client';

import { skipToken, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { GalleryPostsDocument, PostSort, type GalleryPostsQuery } from '@/shared/api/generated';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PopularPostCard } from '../card/PopularPostCard';
import { PostsEmptyState } from './PostsEmptyState';

const LIMIT = 3;

function PopularPostList({ postsRef }: { postsRef: QueryRef<GalleryPostsQuery> }) {
  const { data } = useReadQuery(postsRef);
  if (!data.galleryPosts.length) return <PostsEmptyState title="이달의 첫 웃음을 기다려요" />;
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4" data-photo-feed>
      {data.galleryPosts.map(({ id }, index) => (
        <PopularPostCard key={id} id={id} rank={index + 1} />
      ))}
    </div>
  );
}

/** 이달(KST)의 좋아요 순위 상위 게시물. 순위·64px 사진·내용 순서로 한 줄씩 보여 준다. */
export function PopularPosts({ groupId, preloaded = true }: { groupId?: string; preloaded?: boolean }) {
  const isSSR = useIsSSR();
  const [postsRef, { refetch }] = useBackgroundQuery(
    GalleryPostsDocument,
    !preloaded && isSSR
      ? skipToken
      : {
          variables: { groupId: groupId ?? null, sort: PostSort.MonthlyPopular, offset: 0, limit: LIMIT },
          refetchWritePolicy: 'overwrite',
        },
  );
  const fallback = <Skeleton className="h-48 w-full" />;
  return (
    <section className="relative flex min-w-0 flex-col gap-3" aria-label="이달의 인기">
      <h2 className="flex min-h-touch items-center text-subtitle text-ink">이달의 인기</h2>
      <p className="-mt-2 mb-2 hidden text-caption text-muted desktop:block">
        이번 달 좋아요를 많이 받은 순간
      </p>
      <AsyncBoundary onRetry={refetch} fallback={fallback}>
        {postsRef ? <PopularPostList postsRef={postsRef} /> : fallback}
      </AsyncBoundary>
    </section>
  );
}
