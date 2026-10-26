import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';
import { type TBlockUserDto } from './block-input.dto';

@Injectable()
export class BlocksService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async blocks(req: SessionRequest) {
    const u = requireUser(req);
    return (
      await this.db.block.findMany({
        where: { userId: u.id },
        include: { blockedUser: { select: authorSelect } },
      })
    ).map((b) => authorDto(b.blockedUser));
  }
  async block(req: SessionRequest, input: TBlockUserDto) {
    const u = requireUser(req);
    if (input.blockedUserId === u.id)
      throw new ApiError(400, 'CANNOT_BLOCK_SELF', '자신은 차단할 수 없습니다.');
    if (!(await this.db.user.findUnique({ where: { id: input.blockedUserId, withdrawnAt: null } })))
      throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    await this.transactions.run(async (tx) => {
      await this.lockRelationship(u.id, input.blockedUserId, tx);
      await (tx ?? this.db).block.upsert({
        where: { userId_blockedUserId: { userId: u.id, blockedUserId: input.blockedUserId } },
        update: {},
        create: { userId: u.id, ...input },
      });
      await (tx ?? this.db).userFollow.deleteMany({
        where: {
          OR: [
            { followerId: u.id, followingId: input.blockedUserId },
            { followerId: input.blockedUserId, followingId: u.id },
          ],
        },
      });
      await (tx ?? this.db).notification.deleteMany({
        where: {
          OR: [
            { userId: u.id, actorId: input.blockedUserId },
            { userId: input.blockedUserId, actorId: u.id },
          ],
        },
      });
    });
    return { ok: true };
  }
  async unblock(req: SessionRequest, id: string) {
    const u = requireUser(req);
    await this.db.block.deleteMany({ where: { userId: u.id, blockedUserId: id } });
    return { ok: true };
  }

  private lockRelationship(first: string, second: string, client: Prisma.TransactionClient) {
    const key = `user-relationship:${[first, second].sort().join(':')}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}
