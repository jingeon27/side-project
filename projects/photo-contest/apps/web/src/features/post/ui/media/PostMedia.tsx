'use client';

import Image from 'next/image';

import { useFragment } from '@apollo/client/react';
import { match } from 'ts-pattern';

import { GalleryPostCardFragmentDoc, PostKind } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';

/** 틀은 사진 비율을 따르되 세로는 4:5, 가로는 1.91:1까지만 늘린다. 크기를 모르는 예전 게시물은 null이다. */
function frameRatio(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height) return null;
  return Math.min(1.91, Math.max(4 / 5, width / height));
}

export function PostMedia({
  postId,
  detail = false,
  isPriority = false,
  className,
}: {
  postId: string;
  detail?: boolean;
  /** 첫 화면의 첫 장만 먼저 불러온다. */
  isPriority?: boolean;
  /** 놓이는 자리에 맞춘 모서리 등. 카드는 너비를 채우려고 모서리를 없앤다. */
  className?: string;
}) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  if (!complete) return null;
  const mediaUrl = post.mediaUrl;
  if (!mediaUrl) return null;
  const ratio = frameRatio(post.mediaWidth, post.mediaHeight);
  const frameClassName = cn(
    'w-full overflow-hidden rounded-card bg-sunken object-contain',
    // 댓글 창의 원본은 열 높이를 채우지 않고 사진 크기만큼만 두어 본문이 사진 바로 아래에 온다.
    detail ? 'max-h-[60dvh] shrink-0' : 'desktop:max-h-[60dvh]',
    !ratio && (detail ? 'aspect-4/3' : 'aspect-square desktop:aspect-4/3'),
    className,
  );
  const frameStyle = ratio ? { aspectRatio: ratio } : undefined;
  return match(post.kind)
    .with(PostKind.Video, () => (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- 사용자가 올린 동영상이라 함께 제공할 자막 파일이 없다.
      <video
        src={mediaUrl}
        controls
        playsInline
        preload={detail ? 'none' : 'metadata'}
        aria-label={post.title}
        className={frameClassName}
        style={frameStyle}
      />
    ))
    .with(PostKind.Photo, () => (
      <div className={cn('relative', frameClassName)} style={frameStyle}>
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
          loading={isPriority ? 'eager' : 'lazy'}
          fetchPriority={isPriority ? 'high' : 'auto'}
          className="object-contain"
        />
      </div>
    ))
    .with(PostKind.Link, () => null)
    .exhaustive();
}
