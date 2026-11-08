'use client';

import { useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import { PostCardList, PostPreviewCard } from '@/features/post';
import { PostSort, PublicGalleryPostsDocument, type PublicGalleryPostsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { FeedLoadMore } from '@/shared/ui/@core/feed-load-more';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function PublicPosts({ queryRef }: { queryRef: QueryRef<PublicGalleryPostsQuery> }) {
  const pagination = useInfiniteQuery(
    queryRef,
    (data) => data.publicGalleryPostsPage.nextOffset,
    (offset) => trackEvent(ANALYTICS_EVENT.PostListPageLoaded, { surface: 'public', offset }),
  );
  const posts = pagination.data.publicGalleryPostsPage.items;
  if (!posts.length) return null;
  return (
    <section className="mx-auto flex w-full max-w-feed flex-col gap-5" aria-label="공개 그룹의 최신 사진">
      <h2 className="border-b border-line pb-3 text-subtitle text-ink">공개 그룹의 최신 사진</h2>
      <PostCardList>
        {posts.map(({ id }) => (
          <PostPreviewCard key={id} id={id} />
        ))}
      </PostCardList>
      <FeedLoadMore
        hasMore={pagination.hasNextPage}
        loading={pagination.isFetchingNextPage}
        loadingLabel="게시물을 더 불러오는 중"
        onLoadMore={pagination.fetchNextPage}
      />
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
