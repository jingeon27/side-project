'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart, Trash2, Video } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { overlay } from 'overlay-kit';
import { match } from 'ts-pattern';

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
    <article className="min-w-0 border-b border-line bg-surface pb-5" aria-label={post.title}>
      <div className="flex items-center gap-3 pb-3">
        <span className="flex shrink-0 rounded-full bg-linear-to-tr from-accent via-danger to-info p-0.5">
          <Avatar name={post.author.nickname} src={post.author.avatar} className="border-2 border-surface" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-label text-ink">{post.author.nickname}</p>
          <Link
            href={ROUTES.GROUP(post.groupId)}
            className="relative w-fit max-w-full truncate text-caption text-muted before:absolute before:inset-x-0 before:-inset-y-3 hover:text-ink active:opacity-60"
          >
            {post.groupName}
          </Link>
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
      {match(post.kind)
        .with(PostKind.Video, () => (
          <video
            src={post.mediaUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={post.title}
            className="aspect-square w-full rounded-control bg-sunken object-contain"
          />
        ))
        .with(PostKind.Photo, () => (
          <div className="relative aspect-square overflow-hidden rounded-control bg-sunken">
            <Image
              src={post.mediaUrl}
              alt={post.title}
              fill
              unoptimized
              sizes="(min-width:768px) 540px, calc(100vw - 32px)"
              className="object-contain"
            />
          </div>
        ))
        .exhaustive()}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          variant="ghost"
          size="md"
          className="-ml-3 self-start gap-2 px-3"
          aria-label={`${post.title} 좋아요`}
          aria-pressed={post.likedByMe}
          loading={likeState.loading || unlikeState.loading}
          onClick={async () => {
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
            className={post.likedByMe ? 'size-6 fill-danger text-danger' : 'size-6'}
          />
          <span className="text-label">좋아요 {formatCount(post.likeCount)}개</span>
        </Button>
        <h3 className="wrap-break-word text-label text-ink">{post.title}</h3>
        {post.body ? (
          <details className="text-body text-ink">
            <summary className="min-h-touch cursor-pointer content-center text-caption text-muted">
              내용 보기
            </summary>
            <p className="whitespace-pre-wrap wrap-break-word">{post.body}</p>
          </details>
        ) : null}
        <p className="text-micro text-muted">
          <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
