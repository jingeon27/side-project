import type { Prisma } from '../generated/prisma';

interface IBoundary {
  at: Date | null;
  id: string | null;
}
interface IHistoryBoundary {
  firstUserId: string;
  firstClearedAt: Date | null;
  firstClearedId: string | null;
  secondClearedAt: Date | null;
  secondClearedId: string | null;
  /** 문의 대화는 문의를 시작한 시점 이후만 보인다. 일반 대화였던 기록에 밴·차단 예외가 번지지 않게 한다. */
  support: { historyStartAt: Date | null; historyStartId: string | null } | null;
}

function later(left: IBoundary, right: IBoundary): IBoundary {
  if (!left.at) return right;
  if (!right.at) return left;
  if (left.at.getTime() !== right.at.getTime()) return left.at > right.at ? left : right;
  return (left.id ?? '') >= (right.id ?? '') ? left : right;
}

/** 사용자가 지운 경계와 문의 시작 경계 중 더 뒤의 것. 이 경계 이하의 메시지는 그 사용자에게 보이지 않는다. */
export function historyBoundary(row: IHistoryBoundary, userId: string): IBoundary {
  const cleared =
    row.firstUserId === userId
      ? { at: row.firstClearedAt, id: row.firstClearedId }
      : { at: row.secondClearedAt, id: row.secondClearedId };
  return later(cleared, { at: row.support?.historyStartAt ?? null, id: row.support?.historyStartId ?? null });
}

export function historyWhere(row: IHistoryBoundary, userId: string): Prisma.ChatMessageWhereInput {
  const boundary = historyBoundary(row, userId);
  if (!boundary.at) return {};
  return {
    OR: [{ createdAt: { gt: boundary.at } }, { createdAt: boundary.at, id: { gt: boundary.id ?? '' } }],
  };
}

export function advancesBoundary(message: { createdAt: Date; id: string }, boundary: IBoundary) {
  return (
    !boundary.at ||
    message.createdAt > boundary.at ||
    (message.createdAt.getTime() === boundary.at.getTime() && message.id > (boundary.id ?? ''))
  );
}
