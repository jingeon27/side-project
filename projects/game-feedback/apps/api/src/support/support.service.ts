import { UnitOfWork } from '../database/unit-of-work';
import { SupportRepository } from './support.repository';
import type { StartSupportDto } from './support-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ApiError } from '../common/http/api-error';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class SupportService {
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
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
    const thread = await this.transactions.run(async (tx) => {
      await this.repository.lockUser(user.id, tx);
      const existing = await this.repository.findFirstSupportConversation(
        {
          where: { requesterId: user.id, admin: availableAdmin },
        },
        tx,
      );
      if (existing)
        return this.repository.updateSupportConversation(
          { where: { id: existing.id }, data: { topic, status: 'OPEN' } },
          tx,
        );
      const admin = await this.repository.findFirstUser(
        {
          where: {
            role: 'ADMIN',
            ...availableAdmin,
            id: { not: user.id },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        tx,
      );
      if (!admin)
        throw new ApiError(
          503,
          'SUPPORT_UNAVAILABLE',
          '지금은 문의를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.',
        );
      const [firstUserId, secondUserId] = [user.id, admin.id].sort();
      const conversation = await this.repository.upsertChatConversation(
        {
          where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
          update: {},
          create: { firstUserId, secondUserId },
        },
        tx,
      );
      return this.repository.createSupportConversation(
        {
          data: { requesterId: user.id, adminId: admin.id, conversationId: conversation.id, topic },
        },
        tx,
      );
    });
    return this.chat.conversation(req, thread.conversationId);
  }
}
