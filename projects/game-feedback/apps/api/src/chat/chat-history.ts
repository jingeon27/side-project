import type { Prisma } from '../generated/prisma';

interface IHistoryBoundary {
  firstUserId: string;
  firstClearedAt: Date | null;
  firstClearedId: string | null;
  secondClearedAt: Date | null;
  secondClearedId: string | null;
}

export function historyBoundary(row: IHistoryBoundary, userId: string) {
  return row.firstUserId === userId
    ? { at: row.firstClearedAt, id: row.firstClearedId }
    : { at: row.secondClearedAt, id: row.secondClearedId };
}

export function historyWhere(row: IHistoryBoundary, userId: string): Prisma.ChatMessageWhereInput {
  const boundary = historyBoundary(row, userId);
  if (!boundary.at) return {};
  return {
    OR: [{ createdAt: { gt: boundary.at } }, { createdAt: boundary.at, id: { gt: boundary.id ?? '' } }],
  };
}

export function advancesBoundary(
  message: { createdAt: Date; id: string },
  boundary: { at: Date | null; id: string | null },
) {
  return (
    !boundary.at ||
    message.createdAt > boundary.at ||
    (message.createdAt.getTime() === boundary.at.getTime() && message.id > (boundary.id ?? ''))
  );
}
