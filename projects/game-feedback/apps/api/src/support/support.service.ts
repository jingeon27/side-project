import { Inject, Injectable } from '@nestjs/common';
import { SupportInputSchema, SupportStatusInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { requireAdmin, requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { authorDto, authorSelect } from '../users/user.presenter';
import { ChatService } from '../chat/chat.service';

const include = {
  requester: { select: authorSelect },
  conversation: { select: { updatedAt: true } },
} as const;
@Injectable()
export class SupportService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async start(req: SessionRequest, body: unknown) {
    const user = requireUser(req);
    const { topic } = parse(SupportInputSchema, body);
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
  async list(req: SessionRequest) {
    const admin = requireAdmin(req);
    const rows = await this.db.supportConversation.findMany({
      where: { adminId: admin.id },
      include,
      orderBy: { conversation: { updatedAt: 'desc' } },
      take: 100,
    });
    return rows.map((row) => ({
      ...row,
      requester: authorDto(row.requester),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.conversation.updatedAt.toISOString(),
      conversation: undefined,
    }));
  }
  async status(req: SessionRequest, id: string, body: unknown) {
    const admin = requireAdmin(req);
    const { status } = parse(SupportStatusInputSchema, body);
    const row = await this.db.$transaction(async (tx) => {
      const thread = await tx.supportConversation.findFirst({ where: { id, adminId: admin.id } });
      if (!thread) throw new ApiError(404, 'SUPPORT_NOT_FOUND', '문의를 찾을 수 없습니다.');
      const updated = await tx.supportConversation.update({ where: { id }, data: { status }, include });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: `SUPPORT_${status}`,
          targetType: 'SUPPORT',
          targetId: id,
          detail: '문의 처리 상태 변경',
        },
      });
      return updated;
    });
    return {
      ...row,
      requester: authorDto(row.requester),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.conversation.updatedAt.toISOString(),
      conversation: undefined,
    };
  }
}
