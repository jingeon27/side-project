import { Inject, Injectable } from '@nestjs/common';
import { FollowInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { UserVisibilityService } from '../users/user-visibility.service';
import { lockUserRelationship } from '../common/relationship-lock';

@Injectable()
export class FollowsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  private async target(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.db.user.findFirst({
      where: { id: { equals: id, notIn: excluded }, bannedAt: null },
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

  async follow(req: SessionRequest, id: string, body: unknown) {
    const user = requireUser(req);
    const input = parse(FollowInputSchema, body);
    if (user.id === id) throw new ApiError(400, 'CANNOT_FOLLOW_SELF', '자신을 팔로우할 수 없습니다.');
    await this.target(req, id);
    const follow = await this.db.$transaction(async (tx) => {
      await lockUserRelationship(tx, user.id, id);
      const blocked = await tx.block.findFirst({
        where: {
          OR: [
            { userId: user.id, blockedUserId: id },
            { userId: id, blockedUserId: user.id },
          ],
        },
        select: { id: true },
      });
      if (blocked) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      return tx.userFollow.upsert({
        where: { followerId_followingId: { followerId: user.id, followingId: id } },
        create: { followerId: user.id, followingId: id, ...input },
        update: input,
      });
    });
    return { following: true, notifyNewPosts: follow.notifyNewPosts };
  }

  async unfollow(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.db.$transaction(async (tx) => {
      await lockUserRelationship(tx, user.id, id);
      await tx.userFollow.deleteMany({ where: { followerId: user.id, followingId: id } });
    });
    return { ok: true };
  }
}
