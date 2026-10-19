'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart, MessageCircle, Trash2, Video } from 'lucide-react';
import Link from 'next/link';
import { overlay } from 'overlay-kit';

import {
  DeletePostDocument,
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  PostKind,
  LikePostDocument,
  UnlikePostDocument,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount, formatDateTime } from '@/shared/lib/format.helper';
import { useHaptics } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';
import { Avatar } from '@/shared/ui/@core/avatar';

import { resetGalleryPosts } from '../model/post.cache';
import { PostCommentsBottomSheet } from './PostCommentsBottomSheet';
import { PostMedia } from './PostMedia';

export function PostCard({ id }: { id: string }) {
  const haptics = useHaptics();
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id },
  });
  const [like, likeState] = useMutation(LikePostDocument, {
    refetchQueries: [GalleryPostsDocument],
    onCompleted: () => haptics.impact('light'),
  });
  const [unlike, unlikeState] = useMutation(UnlikePostDocument, { refetchQueries: [GalleryPostsDocument] });
  const [remove] = useMutation(DeletePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [GalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  if (!complete) return null;

  return (
    <article
      id={`post-${id}`}
      className="min-w-0 border-b border-line bg-surface pb-6 desktop:rounded-card desktop:border desktop:p-5"
      aria-label={post.title}
    >
      <div className="flex items-center gap-3 pb-3">
        <Avatar name={post.author.nickname} src={post.author.avatar} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={ROUTES.GROUP(post.groupId)}
            className="relative w-fit max-w-full truncate text-label text-ink before:absolute before:inset-x-0 before:-inset-y-3 hover:text-muted active:opacity-60"
          >
            {post.groupName}
          </Link>
          <p className="truncate text-caption text-muted">{post.author.nickname}</p>
        </div>
        {post.kind === PostKind.Video ? (
          <Video aria-label="동영상" className="size-4 shrink-0 text-muted" />
        ) : null}
        {post.canDelete ? (
          <Button
            variant="ghost"
            size="md"
            className="px-3 text-muted"
            aria-label={`${post.title} 삭제`}
            onClick={() =>
              overlay.open(({ isOpen, close, unmount }) => (
                <ConfirmDialog
                  isOpen={isOpen}
                  onClose={close}
                  unmount={unmount}
                  title="게시물을 삭제할까요?"
                  description="사진·동영상과 좋아요가 함께 삭제됩니다."
                  confirmLabel="게시물 삭제하기"
                  tone="danger"
                  onConfirm={async () => {
                    await remove({ variables: { postId: id } });
                    toast.success('게시물을 삭제했어요');
                  }}
                />
              ))
            }
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        ) : null}
      </div>
      <h3 className="mb-3 wrap-break-word text-title text-ink">{post.title}</h3>
      <PostMedia postId={id} />
      {post.body ? (
        <p className="pt-4 text-body whitespace-pre-wrap wrap-break-word text-ink">{post.body}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            className="gap-2 rounded-full border-line px-3"
            aria-label={`${post.title} 좋아요`}
            aria-pressed={post.likedByMe}
            loading={likeState.loading || unlikeState.loading}
            onClick={async () => {
              if (!post.canInteract) {
                toast.info('그룹에 가입하면 좋아요를 남길 수 있어요.');
                return;
              }
              try {
                await (post.likedByMe ? unlike : like)({ variables: { postId: id } });
              } catch {
                /* ErrorLink가 알린다. */
              }
            }}
          >
            <Heart
              aria-hidden
              strokeWidth={1.7}
              className={post.likedByMe ? 'size-4 fill-danger text-danger' : 'size-4'}
            />
            <span className="text-caption">좋아요 {formatCount(post.likeCount)}개</span>
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="gap-2 px-3 text-muted"
            aria-label={`${post.title} 댓글 ${formatCount(post.commentCount)}개`}
            onClick={() =>
              overlay.open(({ isOpen, close, unmount }) => (
                <PostCommentsBottomSheet postId={id} isOpen={isOpen} onClose={close} unmount={unmount} />
              ))
            }
          >
            <MessageCircle aria-hidden className="size-4" />
            <span className="text-caption">댓글 {formatCount(post.commentCount)}개</span>
          </Button>
        </div>
        <p className="text-caption text-muted">
          <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
