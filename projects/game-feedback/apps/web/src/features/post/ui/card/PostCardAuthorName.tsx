'use client';

import type { ReactNode } from 'react';

import { usePostCard } from './post-card.hook';

/** 작성자 이름. 프로필 링크 등을 children으로 넣지 않으면 닉네임을 보여 준다. */
export function PostCardAuthorName({ children }: { children?: ReactNode }) {
  const post = usePostCard();
  return <strong>{children ?? post.author.nickname}</strong>;
}
