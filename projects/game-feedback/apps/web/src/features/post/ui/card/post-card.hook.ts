import { createContext, use } from 'react';

import type { Post } from '@/shared/api';

export const PostCardContext = createContext<Post | null>(null);

/** 카드 부품이 감싼 PostCard의 게시글을 읽는다. */
export function usePostCard() {
  const post = use(PostCardContext);
  if (!post) throw new Error('PostCard is required.');
  return post;
}
