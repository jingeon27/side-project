'use client';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart, Trash2 } from 'lucide-react';
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
import { formatDateTime } from '@/shared/lib/format.helper';
import { useHaptics } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

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
    <article
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
      aria-label={post.title}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Link
          href={ROUTES.GROUP(post.groupId)}
          className="min-h-touch content-center truncate text-label text-brand hover:underline"
        >
          {post.groupName}
        </Link>
        <span className="shrink-0 text-micro text-muted">{post.kind === 'VIDEO' ? '동영상' : '사진'}</span>
      </div>
      {match(post.kind)
        .with(PostKind.Video, () => (
          <video
            src={post.mediaUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={post.title}
            className="aspect-square w-full bg-sunken object-contain"
          />
        ))
        .with(PostKind.Photo, () => (
          <div className="relative aspect-square bg-sunken">
            <Image
              src={post.mediaUrl}
              alt={post.title}
              fill
              unoptimized
              sizes="(min-width:1024px) 380px, (min-width:768px) 50vw, 100vw"
              className="object-contain"
            />
          </div>
        ))
        .exhaustive()}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="wrap-break-word text-subtitle text-ink">{post.title}</h3>
        {post.body ? (
          <details className="text-body text-ink">
            <summary className="min-h-touch cursor-pointer content-center text-caption text-muted">
              내용 보기
            </summary>
            <p className="whitespace-pre-wrap wrap-break-word">{post.body}</p>
          </details>
        ) : null}
        <p className="text-caption text-muted">
          {post.author.nickname} · <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
        </p>
        <div className="flex items-center gap-2 border-t border-line pt-2">
          <Button
            variant="ghost"
            size="sm"
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
            <Heart aria-hidden className={post.likedByMe ? 'size-4 fill-brand text-brand' : 'size-4'} />
            {post.likeCount}
          </Button>
          {post.canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-danger"
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
              삭제
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
