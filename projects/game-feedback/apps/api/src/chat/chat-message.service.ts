import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, Prisma } from '../generated/prisma';
import { ChatAccessService } from './chat-access.service';
import { ChatConversationService } from './chat-conversation.service';
import { advancesBoundary, historyBoundary, historyWhere } from './chat-history';
import { type SendMessageDto } from './chat-input.dto';
import { ChatEvents } from './chat.events';
import { messageDto, messageInclude } from './chat.presenter';
@Injectable()
export class ChatMessageService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChatEvents) private readonly events: ChatEvents,
    @Inject(ChatAccessService) private readonly access: ChatAccessService,
    @Inject(ChatConversationService) private readonly conversations: ChatConversationService,
  ) {}
  async messages(req: SessionRequest, id: string, query: ListQueryDto) {
    const user = requireUser(req);
    const conversation = await this.access.visible(user.id, id);

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
      conversation: await this.conversations.present(conversation, user.id),
      items: items.map(messageDto),
      nextCursor: rows.length > query.limit ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async send(req: SessionRequest, id: string, input: SendMessageDto) {
    const user = requireUser(req);
    const body = input;
    // Authorization precedes idempotency lookup so UUID reuse cannot reveal another conversation.
    await this.access.visible(user.id, id);
    const result = await this.transactions
      .run(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
        const conversation = await this.access.visible(user.id, id, tx);
        const previous = await (tx ?? this.db).chatMessage.findUnique({
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
          const eligible = await (tx ?? this.db).chatAttachment.count({
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
        const latest = await (tx ?? this.db).chatMessage.findFirst({
          where: { conversationId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true },
        });
        // Serialize the pair and keep a strictly increasing timestamp for precise read boundaries.
        const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
        const message = await (tx ?? this.db).chatMessage.create({
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
        await (tx ?? this.db).chatConversation.update({
          where: { id },
          data: { updatedAt: createdAt, firstHidden: false, secondHidden: false },
        });
        await (tx ?? this.db).supportConversation.updateMany({
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
}
