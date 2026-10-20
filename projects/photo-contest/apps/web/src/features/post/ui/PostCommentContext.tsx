'use client';

import { useFragment } from '@apollo/client/react';

import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { Avatar } from '@/shared/ui/@core/avatar';

import { PostAttachments } from './PostAttachments';

export function PostCommentContext({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  if (!complete) return null;
  return (
    <article
      aria-label="댓글을 보는 게시물"
      className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r border-line bg-sunken p-6 desktop:flex"
    >
      <div className="flex shrink-0 items-center gap-3">
        <Avatar name={post.author.nickname} src={post.author.avatar} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-label text-ink">{post.groupName}</p>
          <p className="truncate text-caption text-muted">{post.author.nickname}</p>
        </div>
      </div>
      <h3 className="shrink-0 wrap-break-word text-title text-ink">{post.title}</h3>
      <PostAttachments postId={postId} detail />
      {post.body ? (
        <p className="shrink-0 text-body whitespace-pre-wrap wrap-break-word text-ink">{post.body}</p>
      ) : null}
    </article>
  );
}
