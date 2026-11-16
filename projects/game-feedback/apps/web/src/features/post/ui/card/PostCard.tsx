'use client';

import type { ReactNode } from 'react';

import type { Post } from '@/shared/api';
import { m, useMotionPreference } from '@/shared/motion';

import { PostCardContext } from './post-card.hook';

/** 게시글 카드. 화면이 머리·본문·바닥 부품을 골라 조합하고, 부품은 이 카드의 게시글을 읽는다. */
export function PostCard({ post, children }: { post: Post; children: ReactNode }) {
  const reducedMotion = useMotionPreference();
  return (
    <PostCardContext value={post}>
      <m.article
        className="post-card"
        data-board={post.board}
        initial={false}
        animate={{ y: 0, opacity: 1 }}
        whileHover={reducedMotion ? undefined : { y: -3 }}
      >
        {children}
      </m.article>
    </PostCardContext>
  );
}
