import 'server-only';

import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IBoardRouteProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import { BoardFrame } from '../board/BoardFrame';
import { FriendSaleBoard } from './FriendSaleBoard';

export async function FriendSaleBoardRoute({ locale, searchParams, blockUntilReady }: IBoardRouteProps) {
  const { value: initialBoard } = await initialDocumentData(
    boardSnapshot('friend-sale', searchParams),
    blockUntilReady,
  );
  return (
    <BoardFrame locale={locale} slug="friend-sale" initialBoard={initialBoard}>
      <FriendSaleBoard locale={locale} initialBoard={initialBoard} />
    </BoardFrame>
  );
}
