import 'server-only';

import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IBoardRouteProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import { BoardFrame } from '../board/BoardFrame';
import { CoachingBoard } from './CoachingBoard';

export async function CoachingBoardRoute({ locale, searchParams, blockUntilReady }: IBoardRouteProps) {
  const { value: initialBoard } = await initialDocumentData(
    boardSnapshot('coaching', searchParams),
    blockUntilReady,
  );
  return (
    <BoardFrame locale={locale} slug="coaching" initialBoard={initialBoard}>
      <CoachingBoard locale={locale} initialBoard={initialBoard} />
    </BoardFrame>
  );
}
