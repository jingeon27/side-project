'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Menu } from '@base-ui/react/menu';
import { Ellipsis, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { overlay } from 'overlay-kit';

import {
  DeletePostDocument,
  GalleryPostCardFragmentDoc,
  GroupContestDocument,
  GroupContestResultsDocument,
  GroupContestsDocument,
  HiddenGalleryPostsDocument,
  SetPostHiddenDocument,
} from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { getOverlayContainer } from '@/shared/lib/overlay-container.helper';
import { toast } from '@/shared/model/toast';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { IconButton } from '@/shared/ui/@core/icon-button';

import { POST_FEED_QUERIES, resetGalleryPosts } from '../model/post.cache';
import { EditPostBottomSheet } from './EditPostBottomSheet';

const ITEM_CLASS =
  'flex min-h-touch cursor-pointer items-center gap-3 rounded-control px-3 text-label text-ink outline-none data-highlighted:bg-sunken data-disabled:opacity-45 active:bg-neutral-soft';

export function PostActionsMenu({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const [hide, hideState] = useMutation(SetPostHiddenDocument, {
    refetchQueries: [...POST_FEED_QUERIES, HiddenGalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  const [remove, removeState] = useMutation(DeletePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [
      ...POST_FEED_QUERIES,
      GroupContestDocument,
      GroupContestsDocument,
      GroupContestResultsDocument,
    ],
    awaitRefetchQueries: true,
  });
  if (!complete || !post.canDelete) return null;
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton label={`${post.title} 더보기`} className="rounded-full text-muted hover:bg-sunken" />
        }
        disabled={hideState.loading || removeState.loading}
      >
        <Ellipsis aria-hidden className="size-5" />
      </Menu.Trigger>
      <Menu.Portal container={getOverlayContainer()}>
        <Menu.Positioner align="end" sideOffset={8} className="z-dialog">
          <Menu.Popup className="w-48 origin-(--transform-origin) rounded-card border border-line bg-surface p-1.5 shadow-toast outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Menu.Item
              className={ITEM_CLASS}
              onClick={() =>
                overlay.open(({ isOpen, close: onClose, unmount }) => (
                  <EditPostBottomSheet
                    postId={postId}
                    groupId={post.groupId}
                    isOpen={isOpen}
                    onClose={onClose}
                    unmount={unmount}
                  />
                ))
              }
            >
              <Pencil aria-hidden className="size-4 text-muted" /> 수정
            </Menu.Item>
            {post.canModerate ? (
              <Menu.Item
                className={ITEM_CLASS}
                onClick={() =>
                  overlay.open(({ isOpen, close: onClose, unmount }) => (
                    <ConfirmDialog
                      isOpen={isOpen}
                      onClose={onClose}
                      unmount={unmount}
                      title="게시물을 숨길까요?"
                      description="공개 피드와 그룹에서 보이지 않게 됩니다. 숨긴 게시물 관리에서 다시 공개할 수 있어요."
                      confirmLabel="숨기기"
                      onConfirm={async () => {
                        await hide({ variables: { postId, hidden: true } });
                      }}
                    />
                  ))
                }
              >
                <EyeOff aria-hidden className="size-4 text-muted" /> 숨기기
              </Menu.Item>
            ) : null}
            <Menu.Separator className="mx-2 my-1 h-px bg-line" />
            <Menu.Item
              className={cn(ITEM_CLASS, 'text-danger data-highlighted:bg-danger-soft')}
              onClick={() =>
                overlay.open(({ isOpen, close: onClose, unmount }) => (
                  <ConfirmDialog
                    isOpen={isOpen}
                    onClose={onClose}
                    unmount={unmount}
                    title="게시물을 삭제할까요?"
                    description="첨부 파일·댓글·답글과 좋아요가 함께 삭제됩니다."
                    confirmLabel="게시물 삭제하기"
                    tone="danger"
                    onConfirm={async () => {
                      await remove({ variables: { postId } });
                      toast.success('게시물을 삭제했어요');
                    }}
                  />
                ))
              }
            >
              <Trash2 aria-hidden className="size-4" /> 삭제
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
