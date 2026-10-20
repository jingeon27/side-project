import { type Conversation } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient, Prisma } from '../generated/prisma';
import { authorDto } from '../users/user.presenter';
import { ChatAccessService } from './chat-access.service';
import { historyWhere } from './chat-history';
import { type CreateConversationDto } from './chat-input.dto';
import { unreadWhere } from './chat-read.policy';
import { ChatEvents } from './chat.events';
import {
  conversationInclude,
  messageDto,
  messageInclude,
  userSelect,
  type ConversationRow,
} from './chat.presenter';
@Injectable()
export class ChatConversationService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ChatEvents) private readonly events: ChatEvents,
    @Inject(ChatAccessService) private readonly access: ChatAccessService,
  ) {}
  async present(row: ConversationRow, userId: string): Promise<Conversation> {
    const peer = row.firstUserId === userId ? row.secondUser : row.firstUser;
    const [last, unreadCount] = await Promise.all([
      this.db.chatMessage.findFirst({
        where: { conversationId: row.id, ...historyWhere(row, userId) },
        include: messageInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.chatMessage.count({ where: unreadWhere(row, userId) }),
    ]);
    const peerReadAt = row.firstUserId === userId ? row.secondReadAt : row.firstReadAt;
    return {
      id: row.id,
      supportTopic: row.support?.topic === 'VERIFICATION' ? 'VERIFICATION' : row.support ? 'GENERAL' : null,
      peer: authorDto(peer),
      lastMessage: last ? messageDto(last) : null,
      unreadCount,
      updatedAt: row.updatedAt.toISOString(),
      peerLastReadAt: peerReadAt?.toISOString() ?? null,
    };
  }
  async conversation(req: SessionRequest, id: string) {
    const user = requireUser(req);
    return this.present(await this.access.visible(user.id, id), user.id);
  }
  async create(req: SessionRequest, input: CreateConversationDto) {
    const user = requireUser(req);
    if (user.bannedAt)
      throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
    const { recipientId } = input;
    if (recipientId === user.id)
      throw new ApiError(400, 'CANNOT_CHAT_SELF', '자신에게 메시지를 보낼 수 없습니다.');
    const peer = await this.db.user.findUnique({ where: { id: recipientId }, select: userSelect });
    if (
      !peer ||
      peer.bannedAt ||
      (!this.config.demoMode && !this.config.testAuthEnabled && peer.demoKey) ||
      (await this.access.blocked(user.id, recipientId))
    ) {
      throw new ApiError(404, 'RECIPIENT_UNAVAILABLE', '이 사용자와 대화를 시작할 수 없습니다.');
    }
    const [firstUserId, secondUserId] = [user.id, recipientId].sort();
    let row: ConversationRow;
    try {
      row = await this.db.chatConversation.upsert({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        update: {},
        create: { firstUserId, secondUserId },
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
    // Recheck after a concurrent block or deletion before returning private metadata.
    await this.access.visible(user.id, row.id);
    void this.events.publish([user.id, recipientId], row.id);
    return this.present(row, user.id);
  }
  async list(req: SessionRequest, query: ListQueryDto) {
    const user = requireUser(req);

    const cursor = decodeCursor(query.cursor);
    const excluded = await this.access.excluded(user.id);
    const base: Prisma.ChatConversationWhereInput = {
      ...(!this.config.demoMode && !this.config.testAuthEnabled
        ? { firstUser: { demoKey: null }, secondUser: { demoKey: null } }
        : {}),
      OR: [
        { firstUserId: user.id, firstHidden: false },
        { secondUserId: user.id, secondHidden: false },
      ],
      AND: [
        {
          OR: [
            { support: { isNot: null } },
            {
              firstUserId: { notIn: excluded },
              secondUserId: { notIn: excluded },
              firstUser: { bannedAt: null },
              secondUser: { bannedAt: null },
            },
          ],
        },
      ],
    };
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
    const items = await Promise.all(rows.slice(0, query.limit).map((row) => this.present(row, user.id)));
    // The global unread badge includes every visible conversation, not only this page.
    const all = await this.db.chatConversation.findMany({ where: base, include: conversationInclude });
    const counts = await Promise.all(
      all.map((row) => this.db.chatMessage.count({ where: unreadWhere(row, user.id) })),
    );
    const last = rows[Math.min(query.limit, rows.length) - 1];
    return {
      items,
      unreadCount: counts.reduce((sum, count) => sum + count, 0),
      nextCursor: rows.length > query.limit ? encodeCursor({ id: last.id, createdAt: last.updatedAt }) : null,
    };
  }
}
