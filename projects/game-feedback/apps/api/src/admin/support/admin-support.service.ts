import { UnitOfWork } from '../../database/unit-of-work';
import { SupportRepository } from './support.repository';
import type { SupportStatusDto } from './support-input.dto';
import { Inject, Injectable } from '@nestjs/common';
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
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async list(req: SessionRequest) {
    const admin = requireAdmin(req);
    const rows = await this.repository.findManySupportConversation({
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
    const row = await this.transactions.run(async (tx) => {
      const thread = await this.repository.findFirstSupportConversation(
        { where: { id, adminId: admin.id } },
        tx,
      );
      if (!thread) throw new ApiError(404, 'SUPPORT_NOT_FOUND', '문의를 찾을 수 없습니다.');
      const updated = await this.repository.updateSupportConversation(
        { where: { id }, data: { status }, include },
        tx,
      );
      await this.repository.createAuditLog(
        {
          data: {
            actorId: admin.id,
            action: `SUPPORT_${status}`,
            targetType: 'SUPPORT',
            targetId: id,
            detail: '문의 처리 상태 변경',
          },
        },
        tx,
      );
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
