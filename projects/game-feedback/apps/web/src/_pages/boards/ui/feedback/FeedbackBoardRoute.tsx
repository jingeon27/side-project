import 'server-only';

import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IBoardRouteProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import { BoardFrame } from '../board/BoardFrame';
import { FeedbackBoard } from './FeedbackBoard';

export async function FeedbackBoardRoute({ locale, searchParams, blockUntilReady }: IBoardRouteProps) {
  const { value: initialBoard } = await initialDocumentData(
    boardSnapshot('feedback', searchParams),
    blockUntilReady,
  );
  return (
    <BoardFrame locale={locale} slug="feedback" initialBoard={initialBoard}>
      <FeedbackBoard locale={locale} initialBoard={initialBoard} />
    </BoardFrame>
  );
}
