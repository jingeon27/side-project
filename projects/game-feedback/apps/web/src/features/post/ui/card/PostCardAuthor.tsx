'use client';

import type { ReactNode } from 'react';

import { Avatar } from '@/shared/ui';

import { usePostCard } from './post-card.hook';

/** 작성자 사진과 게임 이름 사이에 이름·배지(children)를 둔다. */
export function PostCardAuthor({ children }: { children: ReactNode }) {
  const post = usePostCard();
  return (
    <span className="post-author">
      <Avatar src={post.author.avatarUrl} name={post.author.nickname} size="small" />
      {children}
      <span className="post-author-game">{post.category.name}</span>
    </span>
  );
}
