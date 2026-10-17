'use client';

import { useBackgroundQuery } from '@apollo/client/react';

import { PostCommentsDocument } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCommentComposer } from './PostCommentComposer';
import { PostCommentList } from './PostCommentList';
import { PostCommentsHeader } from './PostCommentsHeader';

const PAGE_SIZE = 24;

export function PostCommentsBottomSheet({
  postId,
  ...controls
}: IBottomSheetControlProps & { postId: string }) {
  const [commentsRef, { refetch }] = useBackgroundQuery(PostCommentsDocument, {
    variables: { postId, offset: 0, limit: PAGE_SIZE },
    fetchPolicy: 'network-only',
    refetchWritePolicy: 'overwrite',
  });
  return (
    <BottomSheet.Root {...controls} className="h-dvh">
      <PostCommentsHeader postId={postId} />
      <BottomSheet.Content className="px-0 pt-3">
        <div className="mx-auto w-full max-w-3xl px-5">
          <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-32 w-full" />}>
            <PostCommentList commentsRef={commentsRef} postId={postId} />
          </AsyncBoundary>
        </div>
      </BottomSheet.Content>
      <BottomSheet.Footer className="pt-2 pb-[calc(12px+var(--safe-bottom))]">
        <PostCommentComposer postId={postId} />
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
