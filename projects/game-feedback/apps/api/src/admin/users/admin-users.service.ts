import { UnitOfWork } from '../../database/unit-of-work';
import { UsersRepository } from './users.repository';
import { type UserBanDto, type VerificationDto } from './user-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
import { ApiError } from '../../common/http/api-error';
import { userDto } from '../../users/user.presenter';
import { ChatEvents } from '../../chat/chat.events';
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(UsersRepository) private readonly repository: UsersRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  async user(req: SessionRequest, id: string) {
    requireAdmin(req);
    const user = await this.repository.findUniqueUser({ where: { id } });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return userDto(user);
  }
  async setVerification(req: SessionRequest, id: string, input: VerificationDto) {
    const admin = requireAdmin(req);
    const user = await this.transactions.run(async (tx) => {
      const target = await this.repository.findUniqueUser({ where: { id } }, tx);
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      const updated = await this.repository.updateUser(
        {
          where: { id },
          data: {
            isVerified: input.isVerified,
            verifiedAt: input.isVerified ? (target.verifiedAt ?? new Date()) : null,
          },
        },
        tx,
      );
      await this.repository.createAuditLog(
        {
          data: {
            actorId: admin.id,
            action: input.isVerified ? 'VERIFY_USER' : 'UNVERIFY_USER',
            targetType: 'USER',
            targetId: id,
            detail: '서비스 사용자 인증 상태 변경',
          },
        },
        tx,
      );
      return updated;
    });
    return userDto(user);
  }
  async ban(req: SessionRequest, id: string, input: UserBanDto) {
    const admin = requireAdmin(req);
    const user = await this.transactions.run(async (tx) => {
      await this.repository.lockUser(id, tx);
      const target = await this.repository.findUniqueUser({ where: { id } }, tx);
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      if (target.role === 'ADMIN')
        throw new ApiError(400, 'ADMIN_PROTECTED', '관리자 계정은 제재할 수 없습니다.');
      const updated = await this.repository.updateUser(
        {
          where: { id },
          data: {
            bannedAt: input.banned ? (target.bannedAt ?? new Date()) : null,
            banReason: input.banned ? input.reason : null,
          },
        },
        tx,
      );
      await this.repository.createAuditLog(
        {
          data: {
            actorId: admin.id,
            action: input.banned ? 'BAN_USER' : 'UNBAN_USER',
            targetType: 'USER',
            targetId: id,
            detail: input.reason,
          },
        },
        tx,
      );
      return updated;
    });
    this.events.closeUser(id);
    return userDto(user);
  }
}
