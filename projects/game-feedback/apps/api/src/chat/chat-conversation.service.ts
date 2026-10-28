import { Inject, Injectable } from '@nestjs/common';
import { match, P } from 'ts-pattern';

import { type Conversation } from '@game-feedback/contracts';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { type TListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, encodeCursor, nextPageAnchor } from '../common/pagination';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { Prisma, PrismaClient } from '../generated/prisma';
import { authorDto } from '../users/user.presenter';
import { ChatAccessService } from './chat-access.service';
import { type TCreateConversationDto } from './chat-input.dto';
import { unreadMessageSql, visibleMessageSql } from './chat-read.policy';
import { ChatEvents } from './chat.events';
import {
  conversationInclude,
  messageDto,
  messageInclude,
  userSelect,
  type ConversationRow,
} from './chat.presenter';
import { conversationPair } from './conversation-pair';

@Injectable()
export class ChatConversationService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ChatEvents) private readonly events: ChatEvents,
    @Inject(ChatAccessService) private readonly access: ChatAccessService,
  ) {}
  async present(row: ConversationRow, userId: string): Promise<Conversation> {
    const [conversation] = await this.presentMany([row], userId);
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', '대화를 찾을 수 없습니다.');
    return conversation;
  }
  /** 대화 수와 관계없이 마지막 메시지·미읽음 집계 쿼리 한 번과 메시지 조회 한 번으로 만든다. */
  async presentMany(rows: ConversationRow[], userId: string): Promise<Conversation[]> {
    if (!rows.length) return [];
    const summaries = await this.db.$queryRaw<
      Array<{ conversationId: string; lastMessageId: string | null; unreadCount: number }>
    >`
      SELECT c."id" AS "conversationId",
        (
          SELECT m."id" FROM "ChatMessage" m
          WHERE m."conversationId" = c."id" AND ${visibleMessageSql(userId)}
          ORDER BY m."createdAt" DESC, m."id" DESC
          LIMIT 1
        ) AS "lastMessageId",
        (
          SELECT COUNT(*)::int FROM "ChatMessage" m
          WHERE m."conversationId" = c."id" AND ${unreadMessageSql(userId)}
        ) AS "unreadCount"
      FROM "ChatConversation" c
      LEFT JOIN "SupportConversation" s ON s."conversationId" = c."id"
      WHERE c."id" IN (${Prisma.join(rows.map((row) => row.id))})
    `;
    const byConversation = new Map(summaries.map((summary) => [summary.conversationId, summary]));
    const lastIds = summaries.flatMap((summary) => (summary.lastMessageId ? [summary.lastMessageId] : []));
    const messages = lastIds.length
      ? await this.db.chatMessage.findMany({ where: { id: { in: lastIds } }, include: messageInclude })
      : [];
    const byId = new Map(messages.map((message) => [message.id, message]));
    return rows.map((row) => {
      const summary = byConversation.get(row.id);
      const last = summary?.lastMessageId ? byId.get(summary.lastMessageId) : undefined;
      const peer = row.firstUserId === userId ? row.secondUser : row.firstUser;
      const peerReadAt = row.firstUserId === userId ? row.secondReadAt : row.firstReadAt;
      return {
        id: row.id,
        // 문의 주제는 DB 문자열이라 인증 문의만 구분하고 나머지 문의는 일반으로 본다.
        supportTopic: match(row.support)
          .returnType<Conversation['supportTopic']>()
          .with(P.nullish, () => null)
          .with({ topic: 'VERIFICATION' }, () => 'VERIFICATION')
          .otherwise(() => 'GENERAL'),
        peer: authorDto(peer),
        lastMessage: last ? messageDto(last) : null,
        unreadCount: summary?.unreadCount ?? 0,
        updatedAt: row.updatedAt.toISOString(),
        peerLastReadAt: peerReadAt?.toISOString() ?? null,
      };
    });
  }
  async conversation(req: SessionRequest, id: string) {
    const user = requireUser(req);
    return this.present(await this.access.visible(user.id, id), user.id);
  }
  async create(req: SessionRequest, input: TCreateConversationDto) {
    const user = requireUser(req);
    if (user.bannedAt)
      throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
    const { recipientId } = input;
    if (recipientId === user.id)
      throw new ApiError(400, 'CANNOT_CHAT_SELF', '자신에게 메시지를 보낼 수 없습니다.');
    const peer = await this.db.user.findUnique({
      where: { id: recipientId, adminAccount: { is: null } },
      select: userSelect,
    });
    if (
      !peer ||
      peer.withdrawnAt ||
      peer.bannedAt ||
      (!this.config.demoMode && !this.config.testAuthEnabled && peer.demoKey) ||
      (await this.access.blocked(user.id, recipientId))
    ) {
      throw new ApiError(404, 'RECIPIENT_UNAVAILABLE', '이 사용자와 대화를 시작할 수 없습니다.');
    }
    const { firstUserId, secondUserId } = conversationPair(user.id, recipientId);
    const mine = firstUserId === user.id ? 'firstHidden' : 'secondHidden';
    const peerSide = mine === 'firstHidden' ? 'secondHidden' : 'firstHidden';
    let row: ConversationRow;
    try {
      // 메시지 없이 연 대화는 상대 목록에 보이지 않는다. 첫 메시지 전송이 양쪽 숨김을 푼다.
      row = await this.db.chatConversation.upsert({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        update: {},
        create: { firstUserId, secondUserId, [peerSide]: true },
        include: conversationInclude,
      });
    } catch (error) {
      // Prisma may emulate upsert with relation reads; the pair's unique key settles concurrent starts.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      row = await this.db.chatConversation.findUniqueOrThrow({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        include: conversationInclude,
      });
    }
    // 상대가 먼저 연 빈 대화를 나도 열면 내 목록에도 보이게 한다. 지운 기록 때문에 숨긴 대화는 그대로 둔다.
    if (
      row[mine] &&
      !(await this.db.chatMessage.findFirst({ where: { conversationId: row.id }, select: { id: true } }))
    )
      row = await this.db.chatConversation.update({
        where: { id: row.id },
        data: { [mine]: false },
        include: conversationInclude,
      });
    // Recheck after a concurrent block or deletion before returning private metadata.
    await this.access.visible(user.id, row.id);
    void this.events.publish([user.id, recipientId], row.id);
    return this.present(row, user.id);
  }
  async list(req: SessionRequest, query: TListQueryDto) {
    const user = requireUser(req);

    const cursor = decodeCursor(query.cursor);
    const excluded = await this.access.excluded(user.id);
    const base = await this.access.listWhere(user.id, excluded);
    const where: Prisma.ChatConversationWhereInput = {
      AND: [
        base,
        ...(cursor
          ? [
              {
                OR: [
                  { updatedAt: { lt: cursor.createdAt } },
                  { updatedAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    };
    const rows = await this.db.chatConversation.findMany({
      where,
      include: conversationInclude,
      take: query.limit + 1,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const [items, unreadCount] = await Promise.all([
      this.presentMany(rows.slice(0, query.limit), user.id),
      this.unreadTotal(user.id, excluded),
    ]);
    const last = nextPageAnchor(rows, query.limit);
    return {
      items,
      unreadCount,
      nextCursor: last ? encodeCursor({ id: last.id, createdAt: last.updatedAt }) : null,
    };
  }
  /**
   * 전체 미읽음 배지는 이 페이지가 아니라 보이는 모든 대화의 합이다. 목록의 base 조건(숨김·테스트 계정·
   * 차단·밴, 문의 예외)을 SQL로 옮겨 집계 쿼리 한 번으로 센다.
   */
  private async unreadTotal(userId: string, excluded: string[]) {
    const includeTestAccounts = this.config.demoMode || this.config.testAuthEnabled;
    const [total] = await this.db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "ChatConversation" c
      JOIN "User" fu ON fu."id" = c."firstUserId"
      JOIN "User" su ON su."id" = c."secondUserId"
      LEFT JOIN "SupportConversation" s ON s."conversationId" = c."id"
      JOIN "ChatMessage" m ON m."conversationId" = c."id"
      WHERE (
          (c."firstUserId" = ${userId} AND c."firstHidden" = false)
          OR (c."secondUserId" = ${userId} AND c."secondHidden" = false)
        )
        AND ${includeTestAccounts ? Prisma.sql`TRUE` : Prisma.sql`fu."demoKey" IS NULL AND su."demoKey" IS NULL`}
        AND (
          s."id" IS NOT NULL
          OR (
            NOT (c."firstUserId" = ANY(${excluded}::text[]))
            AND NOT (c."secondUserId" = ANY(${excluded}::text[]))
            AND fu."bannedAt" IS NULL
            AND su."bannedAt" IS NULL
          )
        )
        AND ${unreadMessageSql(userId)}
    `;
    return total?.count ?? 0;
  }
}
