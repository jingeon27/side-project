'use client';

import type { ReactNode } from 'react';

import { Camera } from 'lucide-react';

import { cn } from '@/shared/lib/cn.helper';
import { EmptyState } from '@/shared/ui/@core/empty-state';

import { PopularPostCard } from './PopularPostCard';
import { PostCard } from './PostCard';

export function GalleryPostList({
  posts,
  popular = false,
  preview = false,
  postAction,
  emptyAction,
}: {
  posts: readonly { id: string }[];
  popular?: boolean;
  preview?: boolean;
  postAction?: (postId: string) => ReactNode;
  emptyAction?: ReactNode;
}) {
  if (!posts.length)
    return (
      <div className="flex flex-col items-center gap-3">
        <EmptyState
          icon={<Camera className="size-6" />}
          title={popular ? '이달의 첫 웃음을 기다려요' : '첫 사진을 올려보세요'}
          description="사진·동영상·링크로 웃긴 순간을 나눠보세요. 합성도 환영해요."
        />
        {emptyAction}
      </div>
    );
  return (
    <div className={cn('grid min-w-0 grid-cols-1 items-start', popular ? 'gap-4' : 'gap-6')} data-photo-feed>
      {posts.map(({ id }, index) =>
        popular ? (
          <PopularPostCard key={id} id={id} rank={index + 1} />
        ) : (
          <div key={id} className="flex min-w-0 flex-col gap-3">
            <PostCard id={id} preview={preview} />
            {postAction?.(id)}
          </div>
        ),
      )}
    </div>
  );
}
