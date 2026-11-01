'use client';

import { useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import { PostCardList, PostPreviewCard } from '@/features/post';
import { PostSort, PublicGalleryPostsDocument, type PublicGalleryPostsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function PublicPosts({ queryRef }: { queryRef: QueryRef<PublicGalleryPostsQuery> }) {
  const pagination = useInfiniteQuery(queryRef, {
    select: (data) => data.publicGalleryPosts,
    pageSize: 24,
  });
  const posts = pagination.items;
  if (!posts.length) return null;
  return (
    <section className="mx-auto flex w-full max-w-feed flex-col gap-5" aria-label="공개 그룹의 최신 사진">
      <h2 className="border-b border-line pb-3 text-subtitle text-ink">공개 그룹의 최신 사진</h2>
      <PostCardList>
        {posts.map(({ id }) => (
          <PostPreviewCard key={id} id={id} />
        ))}
      </PostCardList>
      {pagination.hasNextPage ? (
        <Button
          variant="secondary"
          loading={pagination.isFetchingNextPage}
          onClick={pagination.fetchNextPage}
        >
          게시물 더 보기
        </Button>
      ) : null}
    </section>
  );
}
export function PublicGalleryBoard() {
  const [queryRef, { refetch }] = useBackgroundQuery(PublicGalleryPostsDocument, {
    variables: { sort: PostSort.Newest, offset: 0, limit: 24 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="mx-auto h-60 w-full max-w-feed" />}>
      <PublicPosts queryRef={queryRef} />
    </AsyncBoundary>
  );
}
