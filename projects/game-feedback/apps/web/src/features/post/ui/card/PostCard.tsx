'use client';

import type { ReactNode } from 'react';

import type { Post } from '@/shared/api';
import { m, useMotionPreference } from '@/shared/motion';

export function PostCard({ board, children }: { board: Post['board']; children: ReactNode }) {
  const reducedMotion = useMotionPreference();
  return (
    <m.article
      className="post-card"
      data-board={board}
      initial={false}
      animate={{ y: 0, opacity: 1 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
    >
      {children}
    </m.article>
  );
}
