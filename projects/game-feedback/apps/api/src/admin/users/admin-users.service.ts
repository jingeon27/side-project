import { Inject, Injectable } from '@nestjs/common';

import { requireAdmin } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import { ChatEvents } from '../../chat/chat.events';
import { ApiError } from '../../common/http/api-error';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient } from '../../generated/prisma';
import { userDto } from '../../users/user.presenter';
import { type UserBanDto, type VerificationDto } from './user-input.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  async user(req: SessionRequest, id: string) {
    requireAdmin(req);
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return userDto(user);
  }
  async setVerification(req: SessionRequest, id: string, input: VerificationDto) {
    const admin = requireAdmin(req);
    const user = await this.transactions.run(async (tx) => {
      const target = await (tx ?? this.db).user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      const updated = await (tx ?? this.db).user.update({
        where: { id },
        data: {
          isVerified: input.isVerified,
          verifiedAt: input.isVerified ? (target.verifiedAt ?? new Date()) : null,
        },
      });
      await (tx ?? this.db).auditLog.create({
        data: {
          actorId: admin.id,
          action: input.isVerified ? 'VERIFY_USER' : 'UNVERIFY_USER',
          targetType: 'USER',
          targetId: id,
          detail: '\uC11C\uBE44\uC2A4 \uC0AC\uC6A9\uC790 \uC778\uC99D \uC0C1\uD0DC \uBCC0\uACBD',
        },
      });
      return updated;
    });
    return userDto(user);
  }
  async ban(req: SessionRequest, id: string, input: UserBanDto) {
    const admin = requireAdmin(req);
    const user = await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const target = await (tx ?? this.db).user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      if (target.role === 'ADMIN')
        throw new ApiError(400, 'ADMIN_PROTECTED', '관리자 계정은 제재할 수 없습니다.');
      const updated = await (tx ?? this.db).user.update({
        where: { id },
        data: {
          bannedAt: input.banned ? (target.bannedAt ?? new Date()) : null,
          banReason: input.banned ? input.reason : null,
        },
      });
      await (tx ?? this.db).auditLog.create({
        data: {
          actorId: admin.id,
          action: input.banned ? 'BAN_USER' : 'UNBAN_USER',
          targetType: 'USER',
          targetId: id,
          detail: input.reason,
        },
      });
      return updated;
    });
    this.events.closeUser(id);
    return userDto(user);
  }
}
