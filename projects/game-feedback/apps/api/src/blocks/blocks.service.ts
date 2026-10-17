import { Inject, Injectable } from '@nestjs/common';
import { BlockInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { parse } from '../common/validation';
import { authorDto, authorSelect } from '../users/user.presenter';
import { lockUserRelationship } from '../common/relationship-lock';

@Injectable()
export class BlocksService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  async blocks(req: SessionRequest) {
    const u = requireUser(req);
    return (
      await this.db.block.findMany({
        where: { userId: u.id },
        include: { blockedUser: { select: authorSelect } },
      })
    ).map((b) => authorDto(b.blockedUser));
  }
  async block(req: SessionRequest, body: unknown) {
    const u = requireUser(req),
      input = parse(BlockInputSchema, body);
    if (input.blockedUserId === u.id)
      throw new ApiError(400, 'CANNOT_BLOCK_SELF', '자신은 차단할 수 없습니다.');
    if (!(await this.db.user.findUnique({ where: { id: input.blockedUserId } })))
      throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    await this.db.$transaction(async (tx) => {
      await lockUserRelationship(tx, u.id, input.blockedUserId);
      await tx.block.upsert({
        where: { userId_blockedUserId: { userId: u.id, blockedUserId: input.blockedUserId } },
        update: {},
        create: { userId: u.id, ...input },
      });
      await tx.userFollow.deleteMany({
        where: {
          OR: [
            { followerId: u.id, followingId: input.blockedUserId },
            { followerId: input.blockedUserId, followingId: u.id },
          ],
        },
      });
      await tx.notification.deleteMany({
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
}
