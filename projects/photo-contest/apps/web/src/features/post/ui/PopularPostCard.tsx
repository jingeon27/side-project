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
        className="group flex min-w-0 flex-col items-center gap-2 rounded-control text-center transition-opacity hover:opacity-75 active:opacity-60 desktop:flex-row desktop:text-left"
      >
        <span className="relative flex size-16 shrink-0 rounded-full bg-linear-to-tr from-accent via-danger to-info p-0.5">
          <span className="relative size-full overflow-hidden rounded-full border-2 border-surface bg-sunken">
            {post.kind === PostKind.Photo ? (
              <Image src={post.mediaUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center bg-neutral-soft text-ink">
                <Play aria-hidden className="size-5" />
              </span>
            )}
          </span>
          <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-brand text-micro text-on-brand">
            {rank}
          </span>
        </span>
        <span className="flex w-full min-w-0 flex-col gap-0.5">
          <span className="truncate text-label text-ink">{post.title}</span>
          <span className="hidden truncate text-caption text-muted desktop:block">{post.groupName}</span>
          <span className="flex items-center justify-center gap-1 text-micro text-muted desktop:justify-start">
            <Heart aria-hidden className="size-3" />
            좋아요 {formatCount(post.likeCount)}개
          </span>
        </span>
      </Link>
    </article>
  );
}
