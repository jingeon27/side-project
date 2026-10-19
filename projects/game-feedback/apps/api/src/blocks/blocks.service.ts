import { UnitOfWork } from '../database/unit-of-work';
import { BlocksRepository } from './blocks.repository';
import type { BlockUserDto } from './block-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { authorDto, authorSelect } from '../users/user.presenter';

@Injectable()
export class BlocksService {
  constructor(
    @Inject(BlocksRepository) private readonly repository: BlocksRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async blocks(req: SessionRequest) {
    const u = requireUser(req);
    return (
      await this.repository.findManyBlock({
        where: { userId: u.id },
        include: { blockedUser: { select: authorSelect } },
      })
    ).map((b) => authorDto(b.blockedUser));
  }
  async block(req: SessionRequest, input: BlockUserDto) {
    const u = requireUser(req);
    if (input.blockedUserId === u.id)
      throw new ApiError(400, 'CANNOT_BLOCK_SELF', '자신은 차단할 수 없습니다.');
    if (!(await this.repository.findUniqueUser({ where: { id: input.blockedUserId } })))
      throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    await this.transactions.run(async (tx) => {
      await this.repository.lockRelationship(u.id, input.blockedUserId, tx);
      await this.repository.upsertBlock(
        {
          where: { userId_blockedUserId: { userId: u.id, blockedUserId: input.blockedUserId } },
          update: {},
          create: { userId: u.id, ...input },
        },
        tx,
      );
      await this.repository.deleteManyUserFollow(
        {
          where: {
            OR: [
              { followerId: u.id, followingId: input.blockedUserId },
              { followerId: input.blockedUserId, followingId: u.id },
            ],
          },
        },
        tx,
      );
      await this.repository.deleteManyNotification(
        {
          where: {
            OR: [
              { userId: u.id, actorId: input.blockedUserId },
              { userId: input.blockedUserId, actorId: u.id },
            ],
          },
        },
        tx,
      );
    });
    return { ok: true };
  }
  async unblock(req: SessionRequest, id: string) {
    const u = requireUser(req);
    await this.repository.deleteManyBlock({ where: { userId: u.id, blockedUserId: id } });
    return { ok: true };
  }
}
