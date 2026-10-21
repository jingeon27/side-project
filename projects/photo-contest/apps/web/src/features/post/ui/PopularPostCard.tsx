'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useFragment } from '@apollo/client/react';
import { Heart, Link2, Play } from 'lucide-react';

import { GalleryPostCardFragmentDoc, PostKind } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';

export function PopularPostCard({ id, rank }: { id: string; rank: number }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id },
  });
  if (!complete) return null;
  return (
    <article aria-label={post.title} className="min-w-0">
      <Link
        href={ROUTES.GROUP(post.groupId)}
        className="flex min-w-0 items-center gap-3 rounded-card transition-opacity hover:opacity-75 active:opacity-60"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-badge bg-ink text-caption font-semibold text-on-brand">
          {rank}
          <span className="sr-only">위</span>
        </span>
        <span className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sunken">
          {post.kind === PostKind.Photo && post.mediaUrl ? (
            <Image src={post.mediaUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-neutral-soft text-ink">
              {post.kind === PostKind.Link ? (
                <Link2 aria-hidden className="size-5" />
              ) : (
                <Play aria-hidden className="size-5" />
              )}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-label text-ink">{post.title}</span>
          <span className="truncate text-caption text-muted">{post.groupName}</span>
          <span className="flex items-center gap-1 text-caption text-muted">
            <Heart aria-hidden className="size-3" />
            좋아요 {formatCount(post.likeCount)}개
          </span>
        </span>
      </Link>
    </article>
  );
}
