'use client';

import { useFragment } from '@apollo/client/react';

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@side/design-system';

import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { OverlayPortal } from '@/shared/ui/@core/overlay-portal';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PostCommentComposer } from './composer/PostCommentComposer';
import { PostCommentList } from './list/PostCommentList';
import type { IPostCommentsPanelProps } from './post-comments.type';
import { PostCommentContext } from './PostCommentContext';

/** 768px부터의 댓글. 넓은 데스크톱에서는 원본 게시물과 대화를 나란히 보여 준다. */
export function PostCommentsModal({
  postId,
  commentsRef,
  onRetry,
  form,
  isOpen,
  onClose,
  unmount,
}: IPostCommentsPanelProps) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  return (
    <OverlayPortal>
      {(container) => (
        <DialogRoot
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          onOpenChangeComplete={(open) => {
            if (!open) unmount?.();
          }}
        >
          <DialogContent
            container={container}
            showCloseButton={false}
            className="flex h-[90dvh] flex-col overflow-hidden p-0 desktop:max-w-6xl"
          >
            <div className="flex shrink-0 items-start gap-2 border-b border-line px-6 pt-6 pb-2">
              <DialogHeader className="min-w-0 flex-1">
                <DialogTitle>댓글</DialogTitle>
                {complete ? (
                  <DialogDescription className="truncate text-caption">{post.title}</DialogDescription>
                ) : null}
              </DialogHeader>
              <DialogClose render={<Button variant="secondary" size="lg" className="h-touch px-4" />}>
                닫기
              </DialogClose>
            </div>
            <div className="flex min-h-0 flex-1 desktop:grid desktop:grid-cols-2 desktop:grid-rows-[minmax(0,1fr)]">
              <PostCommentContext postId={postId} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div
                  data-slot="post-comments-body"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-6"
                >
                  <AsyncBoundary onRetry={onRetry} fallback={<Skeleton className="h-32 w-full" />}>
                    <PostCommentList commentsRef={commentsRef} postId={postId} />
                  </AsyncBoundary>
                </div>
                <div className="shrink-0 border-t border-line px-6 pt-2 pb-[calc(12px+var(--safe-bottom))]">
                  <PostCommentComposer postId={postId} form={form} />
                </div>
              </div>
            </div>
          </DialogContent>
        </DialogRoot>
      )}
    </OverlayPortal>
  );
}
