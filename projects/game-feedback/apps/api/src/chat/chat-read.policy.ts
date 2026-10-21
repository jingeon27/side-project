import { type Prisma } from '../generated/prisma';
import { historyWhere } from './chat-history';
import { type ConversationRow } from './chat.presenter';

export function readBoundary(row: ConversationRow, userId: string) {
  return row.firstUserId === userId
    ? { at: row.firstReadAt, id: row.firstReadId }
    : { at: row.secondReadAt, id: row.secondReadId };
}
export function unreadWhere(row: ConversationRow, userId: string): Prisma.ChatMessageWhereInput {
  const boundary = readBoundary(row, userId);
  return {
    conversationId: row.id,
    senderId: { not: userId },
    AND: [historyWhere(row, userId)],
    ...(boundary.at
      ? {
          OR: [{ createdAt: { gt: boundary.at } }, { createdAt: boundary.at, id: { gt: boundary.id ?? '' } }],
        }
      : {}),
  };
}
