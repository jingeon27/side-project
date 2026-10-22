'use client';

import Link from 'next/link';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart, MessageCircle, Video } from 'lucide-react';
import { overlay } from 'overlay-kit';

import {
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  LikePostDocument,
  PostKind,
  UnlikePostDocument,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount, formatDateTime } from '@/shared/lib/format.helper';
import { useHaptics } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button, ButtonLink } from '@/shared/ui/@core/button';

import { refreshMonthlyPopular } from '../model/post.cache';
import { PostActionsMenu } from './PostActionsMenu';
import { PostAttachments } from './PostAttachments';
import { PostCommentsBottomSheet } from './PostCommentsBottomSheet';
import { PostDownloadButton } from './PostDownloadButton';

export function PostCard({ id, preview = false }: { id: string; preview?: boolean }) {
  const haptics = useHaptics();
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id },
  });
  const [like, likeState] = useMutation(LikePostDocument, {
    refetchQueries: [GalleryPostsDocument],
    onQueryUpdated: refreshMonthlyPopular,
    awaitRefetchQueries: true,
    onCompleted: () => haptics.impact('light'),
  });
  const [unlike, unlikeState] = useMutation(UnlikePostDocument, {
    refetchQueries: [GalleryPostsDocument],
    onQueryUpdated: refreshMonthlyPopular,
    awaitRefetchQueries: true,
  });
  if (!complete) return null;

  return (
    <article
      id={`post-${id}`}
      className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-card desktop:p-5"
      aria-label={post.title}
    >
      <div className="flex items-center gap-3 pb-4">
        <Avatar name={post.author.nickname} src={post.author.avatar} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={ROUTES.GROUP(post.groupId)}
            className="relative w-fit max-w-full truncate text-label font-semibold text-ink before:absolute before:inset-x-0 before:-inset-y-3 hover:text-muted active:opacity-60"
          >
            {post.groupName}
          </Link>
          <p className="truncate text-caption text-muted">{post.author.nickname}</p>
        </div>
        {post.kind === PostKind.Video ? (
          <Video aria-label="동영상" className="size-4 shrink-0 text-muted" />
        ) : null}
        {!preview ? <PostActionsMenu postId={id} /> : null}
      </div>
      {post.contest ? (
        <Link
          href={ROUTES.GROUP_CONTEST(post.groupId, post.contest.id)}
          className="mb-3 inline-flex min-h-touch items-center rounded-control bg-sunken px-3 text-caption text-ink"
        >
          대회 참여 · {post.contest.title} · 좋아요 1인 {post.contest.likeLimit}개
        </Link>
      ) : null}
      {post.category ? (
        <p className="mb-2 text-caption text-muted">
          {post.category.name}
          {post.category.archivedAt ? ' · 보관됨' : ''}
        </p>
      ) : null}
      <h3 className="mb-4 wrap-break-word text-title leading-snug text-ink">{post.title}</h3>
      <PostAttachments postId={id} />
      {post.body ? (
        <p className="pt-4 text-body whitespace-pre-wrap wrap-break-word text-ink">{post.body}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {preview ? (
            <ButtonLink href={ROUTES.GROUP(post.groupId)} variant="secondary" size="md">
              그룹 보기
            </ButtonLink>
          ) : (
            <>
              <Button
                variant="ghost"
                size="md"
                className="gap-2 rounded-full px-3"
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
            </>
          )}
          {post.mediaUrl ? (
            <PostDownloadButton postId={id} title={post.title} mediaUrl={post.mediaUrl} />
          ) : null}
        </div>
        <p className="text-caption text-muted">
          <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
