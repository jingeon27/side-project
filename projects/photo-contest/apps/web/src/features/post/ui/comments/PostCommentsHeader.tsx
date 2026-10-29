'use client';

import { useFragment } from '@apollo/client/react';

import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';

export function PostCommentsHeader({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  return (
    <div className="shrink-0 border-b border-line">
      <div className="mx-auto w-full max-w-3xl desktop:max-w-6xl">
        <BottomSheet.Header
          title="댓글"
          closeLabel="닫기"
          className="pb-2"
          description={
            complete ? <span className="block truncate text-caption">{post.title}</span> : undefined
          }
        />
      </div>
    </div>
  );
}
