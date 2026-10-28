'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { useFragment } from '@apollo/client/react';
import { Video } from 'lucide-react';

import { GalleryPostCardFragmentDoc, PostKind } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';
import { formatDateTime } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';

import { PostDownloadButton } from './PostDownloadButton';
import { PostLink } from './PostLink';
import { PostMedia } from './PostMedia';

/** 카드의 좌우 여백. 미디어만 이 여백 밖에서 카드 너비를 채운다. */
const CARD_INSET = 'px-4 desktop:px-5';

/**
 * 게시물 카드의 공통 틀. 작성자·제목·미디어·본문·작성 시각을 그리고, 머리의 메뉴와 아래쪽 행동은 카드 종류가 넣는다.
 * 여백을 구역마다 주어 미디어가 음수 여백 없이 카드 너비를 채운다.
 */
export function PostCardFrame({ id, menu, actions }: { id: string; menu?: ReactNode; actions: ReactNode }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id },
  });
  if (!complete) return null;

  return (
    <article
      id={`post-${id}`}
      className="min-w-0 overflow-hidden rounded-sheet border border-line bg-surface py-4 shadow-card desktop:py-5"
      aria-label={post.title}
    >
      <div className={cn('flex items-center gap-3 pb-4', CARD_INSET)}>
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
        {menu}
      </div>
      <div className={CARD_INSET}>
        {post.contest ? (
          <Link
            href={ROUTES.GROUP_CONTEST(post.groupId, post.contest.id)}
            className="mb-3 inline-flex min-h-touch max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-card bg-accent-soft px-3 py-2 text-caption text-accent-ink transition-colors hover:bg-accent/20 active:bg-accent/25"
          >
            <span>대회 참여</span>
            <span className="min-w-0 wrap-break-word">{post.contest.title}</span>
            <span>좋아요는 한 사람당 최대 {post.contest.likeLimit}개</span>
          </Link>
        ) : null}
        {post.category ? (
          <p className="mb-2 text-caption text-accent-ink">
            {post.category.name}
            {post.category.archivedAt ? ' (보관됨)' : ''}
          </p>
        ) : null}
        <h3 className="mb-4 wrap-break-word text-title leading-snug text-ink desktop:text-title-lg">
          {post.title}
        </h3>
      </div>
      <PostMedia postId={id} className="rounded-none" />
      <div className={CARD_INSET}>
        <PostLink postId={id} />
        {post.body ? (
          <p className="pt-4 text-body whitespace-pre-wrap wrap-break-word text-ink">{post.body}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-2">
          <div className="flex flex-wrap items-center gap-1">
            {actions}
            {post.mediaUrl ? (
              <PostDownloadButton postId={id} title={post.title} mediaUrl={post.mediaUrl} />
            ) : null}
          </div>
          <p className="text-caption text-muted">
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
          </p>
        </div>
      </div>
    </article>
  );
}
