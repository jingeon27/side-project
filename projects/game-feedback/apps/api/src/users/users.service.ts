import { Inject, Injectable } from '@nestjs/common';
import { VerificationInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireAdmin } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { ACTIVE_CONTENT } from '../common/content';
import { UserVisibilityService } from './user-visibility.service';
import { authorDto, authorSelect, userDto } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async profile(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.db.user.findFirst({
      where: { id, NOT: { id: { in: excluded } } },
      select: { ...authorSelect, createdAt: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const postVisibility = { ...ACTIVE_CONTENT, authorId: { notIn: excluded } };
    const answerVisibility = { authorId: id, ...ACTIVE_CONTENT, post: postVisibility };
    const [postCount, answerCount, helpfulCount] = await Promise.all([
      this.db.post.count({ where: { ...postVisibility, authorId: id } }),
      this.db.answer.count({ where: answerVisibility }),
      this.db.answer.count({ where: { ...answerVisibility, helpful: true } }),
    ]);
    return {
      author: authorDto(user),
      joinedAt: user.createdAt.toISOString(),
      postCount,
      answerCount,
      helpfulCount,
    };
  }
  async setVerification(req: SessionRequest, id: string, body: unknown) {
    const admin = requireAdmin(req),
      input = parse(VerificationInputSchema, body);
    const user = await this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      const updated = await tx.user.update({
        where: { id },
        data: {
          isVerified: input.isVerified,
          verifiedAt: input.isVerified ? (target.verifiedAt ?? new Date()) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: input.isVerified ? 'VERIFY_USER' : 'UNVERIFY_USER',
          targetType: 'USER',
          targetId: id,
          detail: '서비스 사용자 인증 상태 변경',
        },
      });
      return updated;
    });
    return userDto(user);
  }
}
