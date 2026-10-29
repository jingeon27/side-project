'use client';

import type { ReactNode } from 'react';

import { skipToken, useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import { GalleryPostsDocument, PostSort, type GalleryPostsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCard } from '../card/PostCard';
import { PostCardList } from './PostCardList';

const PAGE_SIZE = 24;

interface ILatestPostsProps {
  groupId?: string;
  contestId?: string;
  categoryId?: string;
  /** 영역 제목이자 접근성 이름 */
  title: string;
  /** 게시물이 하나도 없을 때의 안내 */
  empty: ReactNode;
  /** 카드 아래에 붙일 행동(대회 투표 등) */
  postAction?: (postId: string) => ReactNode;
  /** 라우트가 같은 변수로 사전 조회하지 않았으면 false. SSR에서 건너뛰고 브라우저에서 시작한다. */
  preloaded?: boolean;
}

function LatestPostList({
  postsRef,
  empty,
  postAction,
}: {
  postsRef: QueryRef<GalleryPostsQuery>;
  empty: ReactNode;
  postAction?: (postId: string) => ReactNode;
}) {
  const { items, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(postsRef, {
    select: (data) => data.galleryPosts,
    pageSize: PAGE_SIZE,
  });
  return (
    <div className="flex flex-col gap-4">
      {items.length ? (
        <PostCardList>
          {items.map(({ id }) => (
            <div key={id} className="flex min-w-0 flex-col gap-3">
              <PostCard id={id} />
              {postAction?.(id)}
            </div>
          ))}
        </PostCardList>
      ) : (
        empty
      )}
      {hasNextPage ? (
        <Button variant="secondary" onClick={fetchNextPage} loading={isFetchingNextPage}>
          게시물 더 보기
        </Button>
      ) : null}
    </div>
  );
}

/** 최신순 게시물 목록과 더 보기. 그룹·대회·카테고리로 좁힐 수 있다. */
export function LatestPosts({
  groupId,
  contestId,
  categoryId,
  title,
  empty,
  postAction,
  preloaded = true,
}: ILatestPostsProps) {
  const isSSR = useIsSSR();
  const [postsRef, { refetch }] = useBackgroundQuery(
    GalleryPostsDocument,
    !preloaded && isSSR
      ? skipToken
      : {
          variables: {
            groupId: groupId ?? null,
            ...(contestId ? { contestId } : {}),
            ...(categoryId ? { categoryId } : {}),
            sort: PostSort.Newest,
            offset: 0,
            limit: PAGE_SIZE,
          },
          refetchWritePolicy: 'overwrite',
        },
  );
  const fallback = <Skeleton className="h-48 w-full" />;
  return (
    <section className="relative flex min-w-0 flex-col gap-3" aria-label={title}>
      <h2 className="flex min-h-touch items-center gap-2 text-title-lg text-ink">{title}</h2>
      <AsyncBoundary
        resetKey={`${groupId ?? ''}:${contestId ?? ''}:${categoryId ?? ''}`}
        onRetry={refetch}
        fallback={fallback}
      >
        {postsRef ? <LatestPostList postsRef={postsRef} empty={empty} postAction={postAction} /> : fallback}
      </AsyncBoundary>
    </section>
  );
}
