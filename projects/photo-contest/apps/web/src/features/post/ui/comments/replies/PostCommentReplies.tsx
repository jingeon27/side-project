'use client';

import { useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import { PostCommentsDocument, type PostCommentsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCommentRow } from '../list/PostCommentRow';

function ReplyList({
  queryRef,
  replyToName,
}: {
  queryRef: QueryRef<PostCommentsQuery>;
  replyToName: string;
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.postComments,
    pageSize: 12,
    canFetchMore: (data) => data.postComments.length < data.postCommentCount,
  });
  return (
    <>
      <ul aria-label="답글" className="flex flex-col gap-4">
        {data.postComments.map(({ id }) => (
          <li key={id}>
            <PostCommentRow id={id} replyToName={replyToName} />
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          loading={isFetchingNextPage}
          className="mt-2 text-muted"
          onClick={fetchNextPage}
        >
          답글 더 보기
        </Button>
      ) : null}
    </>
  );
}

export function PostCommentReplies({
  postId,
  parentId,
  replyToName,
}: {
  postId: string;
  parentId: string;
  replyToName: string;
}) {
  const [queryRef, { refetch }] = useBackgroundQuery(PostCommentsDocument, {
    variables: { postId, parentId, offset: 0, limit: 12 },
    fetchPolicy: 'network-only',
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-20 w-full" />}>
      <ReplyList queryRef={queryRef} replyToName={replyToName} />
    </AsyncBoundary>
  );
}
