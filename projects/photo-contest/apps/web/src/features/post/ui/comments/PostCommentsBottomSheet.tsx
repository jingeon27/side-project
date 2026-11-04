'use client';

import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCommentComposer } from './composer/PostCommentComposer';
import { PostCommentsHeader } from './header/PostCommentsHeader';
import { PostCommentList } from './list/PostCommentList';
import type { IPostCommentsPanelProps } from './post-comments.type';

const SNAP_POINTS = [0.75, 1];

/** 768px보다 좁은 화면의 댓글. 닫기 버튼 없이 밀기, 바깥 누르기, 뒤로 가기로 닫는다. */
export function PostCommentsBottomSheet({
  postId,
  commentsRef,
  onRetry,
  form,
  ...controls
}: IPostCommentsPanelProps) {
  return (
    <BottomSheet.Root {...controls} ownsHistory={false} snapPoints={SNAP_POINTS}>
      <PostCommentsHeader postId={postId} />
      <BottomSheet.Content className="px-0 pt-3">
        <div className="mx-auto w-full max-w-3xl px-5">
          <AsyncBoundary onRetry={onRetry} fallback={<Skeleton className="h-32 w-full" />}>
            <PostCommentList commentsRef={commentsRef} postId={postId} />
          </AsyncBoundary>
        </div>
      </BottomSheet.Content>
      <BottomSheet.Footer cancelLabel={false} className="pt-2 pb-[calc(12px+var(--safe-bottom))]">
        <PostCommentComposer postId={postId} form={form} />
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
