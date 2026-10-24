'use client';

import { skipToken, useBackgroundQuery, useMutation, type QueryRef } from '@apollo/client/react';

import {
  HiddenGalleryPostsDocument,
  SetPostHiddenDocument,
  type HiddenGalleryPostsQuery,
} from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { POST_FEED_QUERIES } from '../model/post.cache';

function HiddenPosts({ queryRef }: { queryRef: QueryRef<HiddenGalleryPostsQuery> }) {
  const [restore, { loading }] = useMutation(SetPostHiddenDocument, {
    refetchQueries: [HiddenGalleryPostsDocument, ...POST_FEED_QUERIES],
    awaitRefetchQueries: true,
  });
  const pagination = useInfiniteQuery(queryRef, {
    select: (data) => data.hiddenGalleryPosts,
    pageSize: 24,
  });
  const posts = pagination.items;
  return (
    <div className="flex flex-col gap-3">
      {!posts.length ? <p className="text-caption text-muted">숨긴 게시물이 없어요.</p> : null}
      {posts.map((post) => (
        <div key={post.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-body text-ink">{post.title}</span>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={async () => {
              try {
                await restore({ variables: { postId: post.id, hidden: false } });
              } catch {
                /* ErrorLink가 알린다. */
              }
            }}
          >
            다시 공개
          </Button>
        </div>
      ))}
      {pagination.hasNextPage ? (
        <Button
          onClick={() => pagination.fetchNextPage()}
          loading={pagination.isFetchingNextPage}
          variant="secondary"
        >
          더 보기
        </Button>
      ) : null}
    </div>
  );
}
export function HiddenPostManager({ groupId }: { groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(
    HiddenGalleryPostsDocument,
    useIsSSR()
      ? skipToken
      : { variables: { groupId, offset: 0, limit: 24 }, refetchWritePolicy: 'overwrite' },
  );
  const fallback = <Skeleton className="h-24 w-full" />;
  return (
    <details className="rounded-card border border-line bg-surface p-4">
      <summary className="min-h-touch cursor-pointer content-center text-label text-ink">
        숨긴 게시물 관리
      </summary>
      <div className="mt-4">
        <AsyncBoundary onRetry={() => refetch()} fallback={fallback}>
          {queryRef ? <HiddenPosts queryRef={queryRef} /> : fallback}
        </AsyncBoundary>
      </div>
    </details>
  );
}
