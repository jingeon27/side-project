import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import { ChatAccessService } from './chat-access.service';
import { advancesBoundary, historyBoundary, historyWhere } from './chat-history';
import { type ClearHistoryDto, type ReadMessageDto } from './chat-input.dto';
import { readBoundary } from './chat-read.policy';
import { ChatEvents } from './chat.events';

@Injectable()
export class ChatHistoryService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChatEvents) private readonly events: ChatEvents,
    @Inject(ChatAccessService) private readonly access: ChatAccessService,
  ) {}
  async clearHistory(req: SessionRequest, id: string, input: ClearHistoryDto) {
    const user = requireUser(req);
    const { throughMessageId } = input;
    await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
      const conversation = await this.access.visible(user.id, id, tx);
      const message = await (tx ?? this.db).chatMessage.findFirst({
        where: { id: throughMessageId, conversationId: id },
      });
      if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '삭제할 대화내역을 찾을 수 없습니다.');
      if (!advancesBoundary(message, historyBoundary(conversation, user.id))) return;
      const newer = await (tx ?? this.db).chatMessage.count({
        where: {
          conversationId: id,
          OR: [
            { createdAt: { gt: message.createdAt } },
            { createdAt: message.createdAt, id: { gt: message.id } },
          ],
        },
      });
      await (tx ?? this.db).chatConversation.update({
        where: { id },
        data:
          conversation.firstUserId === user.id
            ? { firstClearedAt: message.createdAt, firstClearedId: message.id, firstHidden: newer === 0 }
            : {
                secondClearedAt: message.createdAt,
                secondClearedId: message.id,
                secondHidden: newer === 0,
              },
      });
    });
    void this.events.publish([user.id], id);
    return { ok: true };
  }
  async read(req: SessionRequest, id: string, input: ReadMessageDto) {
    const user = requireUser(req);
    const { messageId } = input;
    const result = await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
      const conversation = await this.access.visible(user.id, id, tx);
      const message = await (tx ?? this.db).chatMessage.findFirst({
        where: { id: messageId, conversationId: id, ...historyWhere(conversation, user.id) },
      });
      if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', '표시된 메시지를 찾을 수 없습니다.');
      const current = readBoundary(conversation, user.id);
      const advances =
        !current.at ||
        message.createdAt > current.at ||
        (message.createdAt.getTime() === current.at.getTime() && message.id > (current.id ?? ''));
      if (advances)
        await (tx ?? this.db).chatConversation.update({
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
