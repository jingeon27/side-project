import { Inject, Injectable } from '@nestjs/common';
import {
  ChatMessageInputSchema,
  ClearChatHistoryInputSchema,
  ChatReadInputSchema,
  ConversationInputSchema,
  ListQuerySchema,
  type ChatMessage,
  type Conversation,
} from '@game-feedback/contracts';
import { Prisma, PrismaClient } from '../generated/prisma';
import { ApiError } from '../common/http/api-error';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { parse } from '../common/validation';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ChatEvents } from './chat.events';
import { authorDto, authorSelect } from '../users/user.presenter';
import { advancesBoundary, historyBoundary, historyWhere } from './chat-history';
import { attachmentDto, attachmentSelect } from './chat-attachment.presenter';

const userSelect = { ...authorSelect, bannedAt: true };
const conversationInclude = {
  firstUser: { select: userSelect },
  secondUser: { select: userSelect },
  support: true,
} as const;
const messageInclude = {
  sender: { select: authorSelect },
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
} as const;
type ConversationRow = Prisma.ChatConversationGetPayload<{ include: typeof conversationInclude }>;
type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

function messageDto(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: authorDto(row.sender),
    body: row.body,
    attachments: row.attachments.map(attachmentDto),
    createdAt: row.createdAt.toISOString(),
    clientMessageId: row.clientMessageId,
  };
}
function readBoundary(row: ConversationRow, userId: string) {
  return row.firstUserId === userId
    ? { at: row.firstReadAt, id: row.firstReadId }
    : { at: row.secondReadAt, id: row.secondReadId };
}
function unreadWhere(row: ConversationRow, userId: string): Prisma.ChatMessageWhereInput {
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

@Injectable()
export class ChatService {
  constructor(
    @Inject(PrismaClient) readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {
    events.canAccess = async (userId, id) => {
      try {
        await this.visible(userId, id);
        return true;
      } catch {
        return false;
      }
    };
  }
  private async excluded(userId: string) {
    const demoAuthors = this.config.demoMode
      ? []
      : await this.db.user.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
    const blocks = await this.db.block.findMany({
      where: { OR: [{ userId }, { blockedUserId: userId }] },
    });
    return [
      ...new Set([
        ...demoAuthors.map((user) => user.id),
        ...blocks.map((block) => (block.userId === userId ? block.blockedUserId : block.userId)),
      ]),
    ];
  }
  private async blocked(
    userId: string,
    peerId: string,
    db: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return !!(await db.block.findFirst({
      where: {
        OR: [
          { userId, blockedUserId: peerId },
          { userId: peerId, blockedUserId: userId },
        ],
      },
      select: { id: true },
    }));
  }
  async visible(
    userId: string,
    id: string,
    db: Prisma.TransactionClient | PrismaClient = this.db,
  ): Promise<ConversationRow> {
    const row = await db.chatConversation.findFirst({
      where: { id, OR: [{ firstUserId: userId }, { secondUserId: userId }] },
      include: conversationInclude,
    });
    if (!row) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', '대화를 찾을 수 없습니다.');
    const peer = row.firstUserId === userId ? row.secondUser : row.firstUser;
    if (!row.support && (row.firstUser.bannedAt || row.secondUser.bannedAt))
      throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
    if (
      (!this.config.demoMode && peer.demoKey) ||
      (!row.support && (await this.blocked(userId, peer.id, db)))
    ) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', '대화를 찾을 수 없습니다.');
    }
    return row;
  }
  private async dto(row: ConversationRow, userId: string): Promise<Conversation> {
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
    return this.dto(await this.visible(user.id, id), user.id);
  }
  async create(req: SessionRequest, input: unknown) {
    const user = requireUser(req);
    if (user.bannedAt)
      throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
    const { recipientId } = parse(ConversationInputSchema, input);
    if (recipientId === user.id)
      throw new ApiError(400, 'CANNOT_CHAT_SELF', '자신에게 메시지를 보낼 수 없습니다.');
    const peer = await this.db.user.findUnique({ where: { id: recipientId }, select: userSelect });
    if (
      !peer ||
      peer.bannedAt ||
      (!this.config.demoMode && peer.demoKey) ||
      (await this.blocked(user.id, recipientId))
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
    await this.visible(user.id, row.id);
    void this.events.publish([user.id, recipientId], row.id);
    return this.dto(row, user.id);
  }
  async list(req: SessionRequest) {
    const user = requireUser(req);
    const query = parse(ListQuerySchema, req.query);
    const cursor = decodeCursor(query.cursor);
    const excluded = await this.excluded(user.id);
    const base: Prisma.ChatConversationWhereInput = {
      ...(!this.config.demoMode ? { firstUser: { demoKey: null }, secondUser: { demoKey: null } } : {}),
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
    const items = await Promise.all(rows.slice(0, query.limit).map((row) => this.dto(row, user.id)));
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
  async messages(req: SessionRequest, id: string) {
    const user = requireUser(req);
    const conversation = await this.visible(user.id, id);
    const query = parse(ListQuerySchema, req.query);
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db.chatMessage.findMany({
      where: {
        conversationId: id,
        AND: [historyWhere(conversation, user.id)],
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: messageInclude,
      take: query.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const items = rows.slice(0, query.limit);
    return {
      conversation: await this.dto(conversation, user.id),
      items: items.map(messageDto),
      nextCursor: rows.length > query.limit ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async send(req: SessionRequest, id: string, input: unknown) {
    const user = requireUser(req);
    const body = parse(ChatMessageInputSchema, input);
    // Authorization precedes idempotency lookup so UUID reuse cannot reveal another conversation.
    await this.visible(user.id, id);
    const result = await this.db
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
        const conversation = await this.visible(user.id, id, tx);
        const previous = await tx.chatMessage.findUnique({
          where: { senderId_clientMessageId: { senderId: user.id, clientMessageId: body.clientMessageId } },
          include: messageInclude,
        });
        if (previous) {
          if (!advancesBoundary(previous, historyBoundary(conversation, user.id)))
            throw new ApiError(
              409,
              'MESSAGE_HISTORY_CLEARED',
              '삭제한 대화의 메시지는 다시 전송할 수 없습니다. 새 메시지로 작성해주세요.',
            );
          if (
            previous.conversationId !== id ||
            previous.body !== body.body ||
            previous.attachments
              .map((item) => item.id)
              .sort()
              .join(',') !== [...(body.attachmentIds ?? [])].sort().join(',')
          )
            throw new ApiError(409, 'MESSAGE_CONFLICT', '이 메시지 요청은 이미 사용되었습니다.');
          return {
            message: previous,
            peerId:
              conversation.firstUserId === user.id ? conversation.secondUserId : conversation.firstUserId,
          };
        }
        const attachmentIds = body.attachmentIds ?? [];
        if (attachmentIds.length) {
          const eligible = await tx.chatAttachment.count({
            where: {
              id: { in: attachmentIds },
              conversationId: id,
              uploaderId: user.id,
              messageId: null,
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          });
          if (eligible !== attachmentIds.length)
            throw new ApiError(400, 'INVALID_ATTACHMENT', '전송할 첨부파일을 다시 선택해주세요.');
        }
        const latest = await tx.chatMessage.findFirst({
          where: { conversationId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true },
        });
        // Serialize the pair and keep a strictly increasing timestamp for precise read boundaries.
        const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
        const message = await tx.chatMessage.create({
          data: {
            conversationId: id,
            senderId: user.id,
            body: body.body,
            clientMessageId: body.clientMessageId,
            createdAt,
            ...(attachmentIds.length
              ? { attachments: { connect: attachmentIds.map((attachmentId) => ({ id: attachmentId })) } }
              : {}),
          },
          include: messageInclude,
        });
        await tx.chatConversation.update({
          where: { id },
          data: { updatedAt: createdAt, firstHidden: false, secondHidden: false },
        });
        await tx.supportConversation.updateMany({
          where: { conversationId: id, requesterId: user.id },
          data: { status: 'OPEN' },
        });
        return {
          message,
          peerId: conversation.firstUserId === user.id ? conversation.secondUserId : conversation.firstUserId,
        };
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(409, 'MESSAGE_CONFLICT', '이 메시지 요청은 이미 사용되었습니다.');
        }
        throw error;
      });
    // Publish only after the transaction commits. The event contains no message body or sender data.
    void this.events.publish([user.id, result.peerId], id);
    return messageDto(result.message);
  }
  async clearHistory(req: SessionRequest, id: string, input: unknown) {
    const user = requireUser(req);
    const { throughMessageId } = parse(ClearChatHistoryInputSchema, input);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
      const conversation = await this.visible(user.id, id, tx);
      const message = await tx.chatMessage.findFirst({ where: { id: throughMessageId, conversationId: id } });
      if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '삭제할 대화내역을 찾을 수 없습니다.');
      if (!advancesBoundary(message, historyBoundary(conversation, user.id))) return;
      const newer = await tx.chatMessage.count({
        where: {
          conversationId: id,
          OR: [
            { createdAt: { gt: message.createdAt } },
            { createdAt: message.createdAt, id: { gt: message.id } },
          ],
        },
      });
      await tx.chatConversation.update({
        where: { id },
        data:
          conversation.firstUserId === user.id
            ? { firstClearedAt: message.createdAt, firstClearedId: message.id, firstHidden: newer === 0 }
            : { secondClearedAt: message.createdAt, secondClearedId: message.id, secondHidden: newer === 0 },
      });
    });
    void this.events.publish([user.id], id);
    return { ok: true };
  }
  async read(req: SessionRequest, id: string, input: unknown) {
    const user = requireUser(req);
    const { messageId } = parse(ChatReadInputSchema, input);
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
      const conversation = await this.visible(user.id, id, tx);
      const message = await tx.chatMessage.findFirst({
        where: { id: messageId, conversationId: id, ...historyWhere(conversation, user.id) },
      });
      if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '표시된 메시지를 찾을 수 없습니다.');
      const current = readBoundary(conversation, user.id);
      const advances =
        !current.at ||
        message.createdAt > current.at ||
        (message.createdAt.getTime() === current.at.getTime() && message.id > (current.id ?? ''));
      if (advances)
        await tx.chatConversation.update({
          where: { id },
          data:
            conversation.firstUserId === user.id
              ? { firstReadAt: message.createdAt, firstReadId: message.id }
              : { secondReadAt: message.createdAt, secondReadId: message.id },
        });
      return {
        peerId: conversation.firstUserId === user.id ? conversation.secondUserId : conversation.firstUserId,
      };
    });
    void this.events.publish([user.id, result.peerId], id);
    return { ok: true };
  }
}
