import type { SupportStatusDto } from './support-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
import { ApiError } from '../../common/http/api-error';
import { authorDto, authorSelect } from '../../users/user.presenter';
const include = {
  requester: { select: authorSelect },
  conversation: { select: { updatedAt: true } },
} as const;
@Injectable()
export class AdminSupportService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
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
  async status(req: SessionRequest, id: string, body: SupportStatusDto) {
    const admin = requireAdmin(req);
    const { status } = body;
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
