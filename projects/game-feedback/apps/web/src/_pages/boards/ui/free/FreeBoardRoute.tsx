import 'server-only';

import { initialDocumentData } from '@/shared/lib/initial-document-data';

import type { IBoardRouteProps } from '../../model/board-page.type';
import { boardSnapshot } from '../../model/board-route.server';
import { BoardFrame } from '../board/BoardFrame';
import { FreeBoard } from './FreeBoard';

export async function FreeBoardRoute({ locale, searchParams, blockUntilReady }: IBoardRouteProps) {
  const { value: initialBoard } = await initialDocumentData(
    boardSnapshot('free', searchParams),
    blockUntilReady,
  );
  return (
    <BoardFrame locale={locale} slug="free" initialBoard={initialBoard}>
      <FreeBoard locale={locale} initialBoard={initialBoard} />
    </BoardFrame>
  );
}
