import { Prisma } from '../generated/prisma';
import { type ConversationRow } from './chat.presenter';

export function readBoundary(row: ConversationRow, userId: string) {
  return row.firstUserId === userId
    ? { at: row.firstReadAt, id: row.firstReadId }
    : { at: row.secondReadAt, id: row.secondReadId };
}

function side(userId: string, first: Prisma.Sql, second: Prisma.Sql) {
  return Prisma.sql`CASE WHEN c."firstUserId" = ${userId} THEN ${first} ELSE ${second} END`;
}
function after(at: Prisma.Sql, id: Prisma.Sql) {
  return Prisma.sql`(${at} IS NULL OR (m."createdAt", m."id") > (${at}, COALESCE(${id}, '')))`;
}

/**
 * `historyWhere`의 SQL 판(지운 경계와 문의 시작 경계 뒤의 메시지). 여러 대화를 한 번에 집계할 때 쓴다.
 * 별칭 c(ChatConversation)·s(SupportConversation, LEFT JOIN)·m(ChatMessage)가 있어야 한다.
 */
export function visibleMessageSql(userId: string) {
  const cleared = after(
    side(userId, Prisma.sql`c."firstClearedAt"`, Prisma.sql`c."secondClearedAt"`),
    side(userId, Prisma.sql`c."firstClearedId"`, Prisma.sql`c."secondClearedId"`),
  );
  return Prisma.sql`${cleared} AND ${after(Prisma.sql`s."historyStartAt"`, Prisma.sql`s."historyStartId"`)}`;
}

/** 상대가 보냈고 보이는 기록 안에 있으며 내 읽음 경계 뒤에 있는 메시지. 별칭은 `visibleMessageSql`과 같다. */
export function unreadMessageSql(userId: string) {
  const read = after(
    side(userId, Prisma.sql`c."firstReadAt"`, Prisma.sql`c."secondReadAt"`),
    side(userId, Prisma.sql`c."firstReadId"`, Prisma.sql`c."secondReadId"`),
  );
  return Prisma.sql`m."senderId" <> ${userId} AND ${visibleMessageSql(userId)} AND ${read}`;
}
