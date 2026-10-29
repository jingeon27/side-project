'use client';

import { useSearchParams } from 'next/navigation';

import { skipToken, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { PostCard, PostCardList } from '@/features/post';
import {
  MyGalleryPostsDocument,
  MyGroupsDocument,
  type MyGalleryPostsQuery,
  type MyGroupsQuery,
} from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { replaceSearchParams } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function MyPosts({ groupId }: { groupId: string | null }) {
  // 라우트는 전체 목록만 사전 조회하므로 URL의 그룹 필터는 hydration 후 조회한다.
  const [queryRef, { refetch }] = useBackgroundQuery(
    MyGalleryPostsDocument,
    useIsSSR() && groupId
      ? skipToken
      : {
          variables: { groupId, offset: 0, limit: 24 },
          refetchWritePolicy: 'overwrite',
        },
  );
  return (
    <AsyncBoundary fallback={<Skeleton className="h-64 w-full" />} onRetry={refetch}>
      {queryRef ? (
        <MyPostList queryRef={queryRef} filtered={Boolean(groupId)} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </AsyncBoundary>
  );
}

function MyPostList({ queryRef, filtered }: { queryRef: QueryRef<MyGalleryPostsQuery>; filtered: boolean }) {
  const { items, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.myGalleryPosts,
    pageSize: 24,
  });
  if (!items.length)
    return (
      <EmptyState
        title={filtered ? '이 그룹에 올린 게시물이 없어요' : '아직 올린 게시물이 없어요'}
        description="가입한 그룹에 사진이나 동영상, 링크를 올려보세요."
      />
    );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PostCardList>
        {items.map(({ id }) => (
          <PostCard key={id} id={id} />
        ))}
      </PostCardList>
      {hasNextPage ? (
        <Button variant="secondary" loading={isFetchingNextPage} onClick={fetchNextPage}>
          게시물 더 보기
        </Button>
      ) : null}
    </div>
  );
}

function MyPostFilters({ groupsRef }: { groupsRef: QueryRef<MyGroupsQuery> }) {
  const { data } = useReadQuery(groupsRef);
  const search = useSearchParams();
  const requested = search.get('group');
  const groupId = data.myGroups.some((group) => group.id === requested) ? requested : null;
  return (
    <>
      <nav aria-label="올린 게시물 그룹 필터" className="flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={groupId ? 'secondary' : 'primary'}
          aria-pressed={!groupId}
          onClick={() => replaceSearchParams({ group: null })}
        >
          전체 그룹
        </Button>
        {data.myGroups.map((group) => (
          <Button
            key={group.id}
            size="sm"
            variant={groupId === group.id ? 'primary' : 'secondary'}
            aria-pressed={groupId === group.id}
            onClick={() => replaceSearchParams({ group: group.id })}
          >
            {group.name}
          </Button>
        ))}
      </nav>
      <MyPosts key={groupId ?? 'all'} groupId={groupId} />
    </>
  );
}

export function MyPostsSection() {
  const [groupsRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="올린 게시물">
      <h2 className="text-title text-ink">올린 게시물</h2>
      <AsyncBoundary fallback={<Skeleton className="h-64 w-full" />} onRetry={refetch}>
        <MyPostFilters groupsRef={groupsRef} />
      </AsyncBoundary>
    </section>
  );
}
