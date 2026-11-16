'use client';

import { match } from 'ts-pattern';

import { BattleSummary } from '@/features/battle';
import { CoachingSummary } from '@/features/coaching';
import { FriendSaleSummary } from '@/features/friend-sale';

import { usePostCard } from './post-card.hook';

/** 게시판 종류에 맞는 코칭·친추판매·전투 요약 */
export function PostCardDetails() {
  const post = usePostCard();
  return match(post.board)
    .with('COACHING', () => post.coaching && <CoachingSummary details={post.coaching} />)
    .with('FRIEND_SALE', () => <FriendSaleSummary details={post.friendSale} />)
    .with('FRIENDLY', () => post.battle && <BattleSummary details={post.battle} />)
    .with('FEEDBACK', 'FREE', undefined, () => null)
    .exhaustive();
}
