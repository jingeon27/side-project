'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { match } from 'ts-pattern';

import { BattleSummary } from '@/features/battle';
import { CoachingSummary } from '@/features/coaching';
import { FriendSaleSummary } from '@/features/friend-sale';
import type { Post } from '@/shared/api';

export function PostCardContent({
  post,
  href,
  children,
}: {
  post: Pick<Post, 'title' | 'body'>;
  href: string;
  children?: ReactNode;
}) {
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

export function PostCardDetails({
  post,
}: {
  post: Pick<Post, 'board' | 'coaching' | 'friendSale' | 'battle'>;
}) {
  return match(post.board)
    .with('COACHING', () => post.coaching && <CoachingSummary details={post.coaching} />)
    .with('FRIEND_SALE', () => <FriendSaleSummary details={post.friendSale} />)
    .with('FRIENDLY', () => post.battle && <BattleSummary details={post.battle} />)
    .with('FEEDBACK', 'FREE', undefined, () => null)
    .exhaustive();
}
