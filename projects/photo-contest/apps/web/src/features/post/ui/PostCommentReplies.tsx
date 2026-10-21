'use client';

import { useTransition } from 'react';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';

import { PostCommentsDocument, type PostCommentsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCommentRow } from './PostCommentRow';

function ReplyList({
  queryRef,
  viewerId,
  postAuthorId,
}: {
  queryRef: QueryRef<PostCommentsQuery>;
  viewerId?: string;
  postAuthorId?: string;
}) {
  const { data } = useReadQuery(queryRef);
  const { fetchMore } = useQueryRefHandlers(queryRef);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <ul aria-label="답글" className="flex flex-col gap-4">
        {data.postComments.map(({ id }) => (
          <li key={id}>
            <PostCommentRow id={id} viewerId={viewerId} postAuthorId={postAuthorId} />
          </li>
        ))}
      </ul>
      {data.postComments.length < data.postCommentCount ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          className="mt-2 text-muted"
          onClick={() =>
            startTransition(async () => {
              try {
                await fetchMore({ variables: { offset: data.postComments.length } });
              } catch {
                /* 조회 경계에서 재시도한다. */
              }
            })
          }
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
  viewerId,
  postAuthorId,
}: {
  postId: string;
  parentId: string;
  viewerId?: string;
  postAuthorId?: string;
}) {
  const [queryRef, { refetch }] = useBackgroundQuery(PostCommentsDocument, {
    variables: { postId, parentId, offset: 0, limit: 12 },
    fetchPolicy: 'network-only',
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-20 w-full" />}>
      <ReplyList queryRef={queryRef} viewerId={viewerId} postAuthorId={postAuthorId} />
    </AsyncBoundary>
  );
}
