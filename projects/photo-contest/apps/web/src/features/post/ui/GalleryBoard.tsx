'use client';

import type { ReactNode } from 'react';

import {
  skipToken,
  useBackgroundQuery,
  useQueryRefHandlers,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { Sparkles } from 'lucide-react';

import { GalleryPostsDocument, PostSort, type GalleryPostsQuery } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { useOffsetPagination } from '@/shared/model/offset-pagination.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { GalleryPostList } from './GalleryPostList';

function BoardContent({
  postsRef,
  limit,
  popular,
  postAction,
  emptyAction,
}: {
  postsRef: QueryRef<GalleryPostsQuery>;
  limit: number;
  popular: boolean;
  postAction?: (postId: string) => ReactNode;
  emptyAction?: ReactNode;
}) {
  const { fetchMore } = useQueryRefHandlers(postsRef);
  const { data } = useReadQuery(postsRef);
  const posts = data.galleryPosts;
  const pagination = useOffsetPagination({
    count: posts.length,
    firstId: posts[0]?.id,
    limit,
    fetchPage: async (offset) => (await fetchMore({ variables: { offset } })).data.galleryPosts.length,
  });
  return (
    <div className="flex flex-col gap-4">
      <GalleryPostList posts={posts} popular={popular} postAction={postAction} emptyAction={emptyAction} />
      {!popular && pagination.hasMore ? (
        <Button variant="secondary" onClick={() => pagination.loadMore()} loading={pagination.pending}>
          게시물 더 보기
        </Button>
      ) : null}
    </div>
  );
}
export function GalleryBoard({
  groupId,
  contestId,
  categoryId,
  popular = false,
  clientOnly = false,
  postAction,
  emptyAction,
}: {
  groupId?: string;
  contestId?: string;
  categoryId?: string;
  popular?: boolean;
  /** 라우트가 사전 조회하지 않은 목록은 SSR에서 건너뛰고 브라우저에서 시작한다. */
  clientOnly?: boolean;
  postAction?: (postId: string) => ReactNode;
  emptyAction?: ReactNode;
}) {
  const limit = popular ? 3 : 24;
  const isSSR = useIsSSR();
  const [postsRef, { refetch }] = useBackgroundQuery(
    GalleryPostsDocument,
    clientOnly && isSSR
      ? skipToken
      : {
          variables: {
            groupId: groupId ?? null,
            ...(contestId ? { contestId } : {}),
            ...(categoryId ? { categoryId } : {}),
            sort: popular ? PostSort.MonthlyPopular : PostSort.Newest,
            offset: 0,
            limit,
          },
          refetchWritePolicy: 'overwrite',
        },
  );
  const fallback = <Skeleton className="h-48 w-full" />;
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
      <AsyncBoundary onRetry={() => refetch()} fallback={fallback}>
        {postsRef ? (
          <BoardContent
            postsRef={postsRef}
            limit={limit}
            popular={popular}
            postAction={postAction}
            emptyAction={emptyAction}
          />
        ) : (
          fallback
        )}
      </AsyncBoundary>
    </section>
  );
}
