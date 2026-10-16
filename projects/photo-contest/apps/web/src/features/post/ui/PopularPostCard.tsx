'use client';

import { useFragment } from '@apollo/client/react';
import { Heart, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
        className="flex min-w-0 flex-col gap-2.5 rounded-card transition-opacity hover:opacity-75 active:opacity-60 desktop:flex-row desktop:items-center"
      >
        <span className="relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-control bg-sunken desktop:size-16 desktop:aspect-square">
          {post.kind === PostKind.Photo ? (
            <Image
              src={post.mediaUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1024px) 64px, (min-width: 768px) 224px, 33vw"
              className="object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-neutral-soft text-ink">
              <Play aria-hidden className="size-5" />
            </span>
          )}
        </span>
        <span className="flex w-full min-w-0 items-start gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-badge bg-ink text-caption font-semibold text-on-brand">
            {rank}
            <span className="sr-only">위</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-label text-ink">{post.title}</span>
            <span className="truncate text-caption text-muted">{post.groupName}</span>
            <span className="flex items-center gap-1 text-caption text-muted">
              <Heart aria-hidden className="size-3" />
              좋아요 {formatCount(post.likeCount)}개
            </span>
          </span>
        </span>
      </Link>
    </article>
  );
}
