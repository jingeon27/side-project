'use client';

import { useFragment } from '@apollo/client/react';
import { MessageCircle } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { formatCount } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

import { PostCommentsBottomSheet } from '../comments/PostCommentsBottomSheet';

export function PostCommentButton({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  if (!complete) return null;
  return (
    <Button
      variant="ghost"
      size="md"
      className="gap-1.5 rounded-full px-2 text-muted"
      aria-label={`${post.title} 댓글 ${formatCount(post.commentCount)}개`}
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <PostCommentsBottomSheet postId={postId} isOpen={isOpen} onClose={onClose} unmount={unmount} />
        ))
      }
    >
      <MessageCircle aria-hidden className="size-5" />
      <span className="text-caption">댓글 {formatCount(post.commentCount)}개</span>
    </Button>
  );
}
