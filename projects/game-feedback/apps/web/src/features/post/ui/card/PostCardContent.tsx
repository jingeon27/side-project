'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { usePostCard } from './post-card.hook';

/** 상세로 가는 제목과 본문 요약. 게시판별 요약은 children으로 넣는다. */
export function PostCardContent({ href, children }: { href: string; children?: ReactNode }) {
  const post = usePostCard();
  return (
    <>
      <Link href={href} className="post-title-link">
        <h3>{post.title}</h3>
      </Link>
      <p className="post-excerpt">{post.body}</p>
      {children}
    </>
  );
}
