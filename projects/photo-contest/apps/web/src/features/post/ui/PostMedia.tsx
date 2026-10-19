'use client';

import { useFragment } from '@apollo/client/react';
import Image from 'next/image';
import { match } from 'ts-pattern';

import { GalleryPostCardFragmentDoc, PostKind } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';

export function PostMedia({ postId, detail = false }: { postId: string; detail?: boolean }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  if (!complete) return null;
  const mediaUrl = post.mediaUrl;
  if (!mediaUrl) return null;
  const frameClassName = cn(
    'w-full overflow-hidden rounded-card bg-sunken object-contain',
    detail ? 'min-h-56 flex-1' : 'aspect-square desktop:aspect-4/3 desktop:max-h-[60dvh]',
  );
  return match(post.kind)
    .with(PostKind.Video, () => (
      <video
        src={mediaUrl}
        controls
        playsInline
        preload={detail ? 'none' : 'metadata'}
        aria-label={post.title}
        className={frameClassName}
      />
    ))
    .with(PostKind.Photo, () => (
      <div className={cn('relative', frameClassName)}>
        <Image
          src={mediaUrl}
          alt={post.title}
          fill
          unoptimized
          sizes={
            detail
              ? '(min-width: 1024px) 520px, 1px'
              : '(min-width: 1024px) 640px, (min-width: 768px) 540px, calc(100vw - 32px)'
          }
          className="object-contain"
        />
      </div>
    ))
    .with(PostKind.Link, () => null)
    .exhaustive();
}
