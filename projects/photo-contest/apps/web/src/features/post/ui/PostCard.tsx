'use client';

import Link from 'next/link';

import { useFragment, useMutation } from '@apollo/client/react';
import { Heart, MessageCircle, Trash2, Video } from 'lucide-react';
import { overlay } from 'overlay-kit';

import {
  DeletePostDocument,
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  GroupContestDocument,
  GroupContestResultsDocument,
  GroupContestsDocument,
  HiddenGalleryPostsDocument,
  LikePostDocument,
  PostKind,
  PublicGalleryPostsDocument,
  SetPostHiddenDocument,
  UnlikePostDocument,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount, formatDateTime } from '@/shared/lib/format.helper';
import { useHaptics } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button, ButtonLink } from '@/shared/ui/@core/button';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { refreshMonthlyPopular, resetGalleryPosts } from '../model/post.cache';
import { PostAttachments } from './PostAttachments';
import { PostCategoryEditor } from './PostCategoryEditor';
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
  const [hide, hideState] = useMutation(SetPostHiddenDocument, {
    refetchQueries: [GalleryPostsDocument, PublicGalleryPostsDocument, HiddenGalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  const [remove] = useMutation(DeletePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [
      GalleryPostsDocument,
      PublicGalleryPostsDocument,
      GroupContestDocument,
      GroupContestsDocument,
      GroupContestResultsDocument,
    ],
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
        {post.canModerate && !preview ? (
          <Button
            variant="ghost"
            size="md"
            loading={hideState.loading}
            aria-label={`${post.title} 숨기기`}
            onClick={() =>
              overlay.open(({ isOpen, close, unmount }) => (
                <ConfirmDialog
                  isOpen={isOpen}
                  onClose={close}
                  unmount={unmount}
                  title="게시물을 숨길까요?"
                  description="공개 피드와 그룹에서 보이지 않게 됩니다. 숨긴 게시물 관리에서 다시 공개할 수 있어요."
                  confirmLabel="숨기기"
                  onConfirm={() => hide({ variables: { postId: id, hidden: true } }).then(() => undefined)}
                />
              ))
            }
          >
            숨기기
          </Button>
        ) : null}
        {!preview ? <PostCategoryEditor postId={id} /> : null}
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
      {post.contest ? (
        <Link
          href={ROUTES.GROUP_CONTEST(post.groupId, post.contest.id)}
          className="mb-3 inline-flex min-h-touch items-center rounded-control bg-sunken px-3 text-caption text-ink"
        >
          대회 참여 · {post.contest.title}
        </Link>
      ) : null}
      {post.category ? (
        <p className="mb-2 text-caption text-muted">
          {post.category.name}
          {post.category.archivedAt ? ' · 보관됨' : ''}
        </p>
      ) : null}
      <h3 className="mb-3 wrap-break-word text-title text-ink">{post.title}</h3>
      <PostAttachments postId={id} />
      {post.body ? (
        <p className="pt-4 text-body whitespace-pre-wrap wrap-break-word text-ink">{post.body}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {preview ? (
            <ButtonLink href={ROUTES.GROUP(post.groupId)} variant="secondary" size="md">
              그룹 보기
            </ButtonLink>
          ) : (
            <>
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
            </>
          )}
          {post.mediaUrl ? <PostDownloadButton postId={id} title={post.title} /> : null}
        </div>
        <p className="text-caption text-muted">
          <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
