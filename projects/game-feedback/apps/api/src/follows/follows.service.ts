import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session/session-access';
import type { SessionRequest } from '../auth/session/session.types';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import { lockUserRelationship } from '../users/relationship-lock';
import { UserVisibilityService } from '../users/user-visibility.service';
import { type TFollowUserDto } from './follow-input.dto';

@Injectable()
export class FollowsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  private async target(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.db.user.findFirst({
      where: { id: { equals: id, notIn: excluded }, bannedAt: null, withdrawnAt: null },
      select: { id: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return user;
  }

  async status(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.target(req, id);
    const follow = await this.db.userFollow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: id } },
    });
    return { following: !!follow, notifyNewPosts: follow?.notifyNewPosts ?? false };
  }

  async follow(req: SessionRequest, id: string, input: TFollowUserDto) {
    const user = requireUser(req);
    if (user.id === id) throw new ApiError(400, 'CANNOT_FOLLOW_SELF', '자신을 팔로우할 수 없습니다.');
    await this.target(req, id);
    const follow = await this.transactions.run(async (tx) => {
      await lockUserRelationship(tx, user.id, id);
      const blocked = await (tx ?? this.db).block.findFirst({
        where: {
          OR: [
            { userId: user.id, blockedUserId: id },
            { userId: id, blockedUserId: user.id },
          ],
        },
        select: { id: true },
      });
      if (blocked) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      return (tx ?? this.db).userFollow.upsert({
        where: { followerId_followingId: { followerId: user.id, followingId: id } },
        create: { followerId: user.id, followingId: id, ...input },
        update: input,
      });
    });
    return { following: true, notifyNewPosts: follow.notifyNewPosts };
  }

  async unfollow(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.transactions.run(async (tx) => {
      await lockUserRelationship(tx, user.id, id);
      await (tx ?? this.db).userFollow.deleteMany({ where: { followerId: user.id, followingId: id } });
    });
    return { ok: true };
  }
}
