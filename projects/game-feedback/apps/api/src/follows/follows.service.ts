import { UnitOfWork } from '../database/unit-of-work';
import { FollowsRepository } from './follows.repository';
import type { FollowUserDto } from './follow-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class FollowsService {
  constructor(
    @Inject(FollowsRepository) private readonly repository: FollowsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  private async target(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const user = await this.repository.findFirstUser({
      where: { id: { equals: id, notIn: excluded }, bannedAt: null },
      select: { id: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return user;
  }

  async status(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.target(req, id);
    const follow = await this.repository.findUniqueUserFollow({
      where: { followerId_followingId: { followerId: user.id, followingId: id } },
    });
    return { following: !!follow, notifyNewPosts: follow?.notifyNewPosts ?? false };
  }

  async follow(req: SessionRequest, id: string, input: FollowUserDto) {
    const user = requireUser(req);
    if (user.id === id) throw new ApiError(400, 'CANNOT_FOLLOW_SELF', '자신을 팔로우할 수 없습니다.');
    await this.target(req, id);
    const follow = await this.transactions.run(async (tx) => {
      await this.repository.lockRelationship(user.id, id, tx);
      const blocked = await this.repository.findFirstBlock(
        {
          where: {
            OR: [
              { userId: user.id, blockedUserId: id },
              { userId: id, blockedUserId: user.id },
            ],
          },
          select: { id: true },
        },
        tx,
      );
      if (blocked) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      return this.repository.upsertUserFollow(
        {
          where: { followerId_followingId: { followerId: user.id, followingId: id } },
          create: { followerId: user.id, followingId: id, ...input },
          update: input,
        },
        tx,
      );
    });
    return { following: true, notifyNewPosts: follow.notifyNewPosts };
  }

  async unfollow(req: SessionRequest, id: string) {
    const user = requireUser(req);
    await this.transactions.run(async (tx) => {
      await this.repository.lockRelationship(user.id, id, tx);
      await this.repository.deleteManyUserFollow({ where: { followerId: user.id, followingId: id } }, tx);
    });
    return { ok: true };
  }
}
