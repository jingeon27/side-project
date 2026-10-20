'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { PublicGalleryPostsDocument, PostSort, type PublicGalleryPostsQuery } from '@/shared/api/generated';
import { useOffsetPagination } from '@/shared/model/offset-pagination.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { GalleryPostList } from './GalleryPostList';

function PublicPosts({ queryRef }: { queryRef: QueryRef<PublicGalleryPostsQuery> }) {
  const { data } = useReadQuery(queryRef);
  const { fetchMore } = useQueryRefHandlers(queryRef);
  const posts = data.publicGalleryPosts;
  const pagination = useOffsetPagination({
    count: posts.length,
    firstId: posts[0]?.id,
    limit: 24,
    fetchPage: async (offset) => (await fetchMore({ variables: { offset } })).data.publicGalleryPosts.length,
  });
  return (
    <>
      <GalleryPostList posts={posts} preview />
      {pagination.hasMore ? (
        <Button variant="secondary" loading={pagination.pending} onClick={() => pagination.loadMore()}>
          게시물 더 보기
        </Button>
      ) : null}
    </>
  );
}
export function PublicGalleryBoard() {
  const [queryRef, { refetch }] = useBackgroundQuery(PublicGalleryPostsDocument, {
    variables: { sort: PostSort.Newest, offset: 0, limit: 24 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <section className="mx-auto flex w-full max-w-feed flex-col gap-5" aria-label="공개 그룹의 최신 사진">
      <h2 className="border-b border-line pb-3 text-subtitle text-ink">공개 그룹의 최신 사진</h2>
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-60 w-full" />}>
        <PublicPosts queryRef={queryRef} />
      </AsyncBoundary>
    </section>
  );
}
