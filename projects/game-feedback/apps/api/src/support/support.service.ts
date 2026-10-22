import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ChatConversationService } from '../chat/chat-conversation.service';
import { conversationPair } from '../chat/conversation-pair';
import { ApiError } from '../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import type { StartSupportDto } from './support-input.dto';

@Injectable()
export class SupportService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChatConversationService) private readonly chat: ChatConversationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async start(req: SessionRequest, body: StartSupportDto) {
    const user = requireUser(req);
    const { topic } = body;
    const availableAdmin = {
      bannedAt: null,
      ...(!this.config.demoMode && !this.config.testAuthEnabled ? { demoKey: null } : {}),
    };
    const thread = await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const existing = await (tx ?? this.db).supportConversation.findFirst({
        where: { requesterId: user.id, admin: availableAdmin },
      });
      if (existing)
        return (tx ?? this.db).supportConversation.update({
          where: { id: existing.id },
          data: { topic, status: 'OPEN' },
        });
      const admin = await (tx ?? this.db).user.findFirst({
        where: {
          role: 'ADMIN',
          ...availableAdmin,
          id: { not: user.id },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!admin)
        throw new ApiError(
          503,
          'SUPPORT_UNAVAILABLE',
          '지금은 문의를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.',
        );
      const { firstUserId, secondUserId } = conversationPair(user.id, admin.id);
      const conversation = await (tx ?? this.db).chatConversation.upsert({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        update: {},
        // 메시지 없는 문의 대화는 관리자 채팅 목록에 보이지 않는다. 첫 메시지 전송이 숨김을 푼다.
        create: {
          firstUserId,
          secondUserId,
          [firstUserId === admin.id ? 'firstHidden' : 'secondHidden']: true,
        },
      });
      // 같은 쌍의 일반 대화를 이어 쓰면 문의 시작 시점을 기록 경계로 둔다. 문의의 밴·차단 예외는
      // 이 경계 뒤의 메시지에만 적용된다. 전송과 같은 대화 행 잠금으로 경계 직후 메시지를 놓치지 않는다.
      await tx.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${conversation.id} FOR UPDATE`;
      const latest = await (tx ?? this.db).chatMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, createdAt: true },
      });
      return (tx ?? this.db).supportConversation.create({
        data: {
          requesterId: user.id,
          adminId: admin.id,
          conversationId: conversation.id,
          topic,
          historyStartAt: latest?.createdAt ?? null,
          historyStartId: latest?.id ?? null,
        },
      });
    });
    return this.chat.conversation(req, thread.conversationId);
  }
}
