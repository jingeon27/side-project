'use client';

import { match } from 'ts-pattern';

import { boardBySlug } from '@/features/board';
import { CommunityPage } from '@/widgets/community-shell';

import type { IBoardPageProps } from '../model/board-page.type';
import { BattleBoard } from './battle/BattleBoard';
import { BoardsTopbar } from './BoardsTopbar';
import { CoachingBoard } from './coaching/CoachingBoard';
import { FeedbackBoard } from './feedback/FeedbackBoard';
import { FreeBoard } from './free/FreeBoard';
import { FriendSaleBoard } from './friend-sale/FriendSaleBoard';

export function BoardsPage({ slug, ...props }: IBoardPageProps & { slug: string }) {
  const board = boardBySlug(slug);
  const content = match(board?.kind)
    .with('FEEDBACK', () => <FeedbackBoard {...props} />)
    .with('FRIENDLY', () => <BattleBoard {...props} />)
    .with('COACHING', () => <CoachingBoard {...props} />)
    .with('FRIEND_SALE', () => <FriendSaleBoard {...props} />)
    .with('FREE', () => <FreeBoard {...props} />)
    .with(undefined, () => null)
    .exhaustive();
  return (
    <CommunityPage locale={props.locale} topbar={<BoardsTopbar locale={props.locale} slug={slug} />}>
      {content}
    </CommunityPage>
  );
}
