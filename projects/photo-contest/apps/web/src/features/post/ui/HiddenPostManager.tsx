'use client';

import {
  skipToken,
  useBackgroundQuery,
  useMutation,
  useQueryRefHandlers,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';

import {
  GalleryPostsDocument,
  HiddenGalleryPostsDocument,
  PublicGalleryPostsDocument,
  SetPostHiddenDocument,
  type HiddenGalleryPostsQuery,
} from '@/shared/api/generated';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { useOffsetPagination } from '@/shared/model/offset-pagination.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function HiddenPosts({ queryRef }: { queryRef: QueryRef<HiddenGalleryPostsQuery> }) {
  const { data } = useReadQuery(queryRef);
  const { fetchMore } = useQueryRefHandlers(queryRef);
  const [restore, { loading }] = useMutation(SetPostHiddenDocument, {
    refetchQueries: [HiddenGalleryPostsDocument, GalleryPostsDocument, PublicGalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  const posts = data.hiddenGalleryPosts;
  const pagination = useOffsetPagination({
    count: posts.length,
    firstId: posts[0]?.id,
    limit: 24,
    fetchPage: async (offset) => (await fetchMore({ variables: { offset } })).data.hiddenGalleryPosts.length,
  });
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
      {pagination.hasMore ? (
        <Button onClick={() => pagination.loadMore()} loading={pagination.pending} variant="secondary">
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
        <AsyncBoundary onRetry={refetch} fallback={fallback}>
          {queryRef ? <HiddenPosts queryRef={queryRef} /> : fallback}
        </AsyncBoundary>
      </div>
    </details>
  );
}
