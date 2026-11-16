import 'server-only';

import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IBoardRouteProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import { BoardFrame } from '../board/BoardFrame';
import { BattleBoard } from './BattleBoard';

export async function BattleBoardRoute({ locale, searchParams, blockUntilReady }: IBoardRouteProps) {
  const { value: initialBoard } = await initialDocumentData(
    boardSnapshot('friendly', searchParams),
    blockUntilReady,
  );
  return (
    <BoardFrame locale={locale} slug="friendly" initialBoard={initialBoard}>
      <BattleBoard locale={locale} initialBoard={initialBoard} />
    </BoardFrame>
  );
}
