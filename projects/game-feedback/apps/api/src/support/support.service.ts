import type { StartSupportDto } from './support-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ApiError } from '../common/http/api-error';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class SupportService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async start(req: SessionRequest, body: StartSupportDto) {
    const user = requireUser(req);
    const { topic } = body;
    const availableAdmin = {
      bannedAt: null,
      ...(!this.config.demoMode && !this.config.testAuthEnabled ? { demoKey: null } : {}),
    };
    const thread = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const existing = await tx.supportConversation.findFirst({
        where: { requesterId: user.id, admin: availableAdmin },
      });
      if (existing)
        return tx.supportConversation.update({ where: { id: existing.id }, data: { topic, status: 'OPEN' } });
      const admin = await tx.user.findFirst({
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
      const [firstUserId, secondUserId] = [user.id, admin.id].sort();
      const conversation = await tx.chatConversation.upsert({
        where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        update: {},
        create: { firstUserId, secondUserId },
      });
      return tx.supportConversation.create({
        data: { requesterId: user.id, adminId: admin.id, conversationId: conversation.id, topic },
      });
    });
    return this.chat.conversation(req, thread.conversationId);
  }
}
