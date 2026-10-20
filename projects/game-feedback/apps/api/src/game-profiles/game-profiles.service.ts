import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, type Prisma } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { GameAccountDto } from './game-account-input.dto';

@Injectable()
export class GameProfilesService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async lookup(playerTag: string) {
    if (!this.config.profileProvider)
      throw new ApiError(503, 'PROFILE_UNAVAILABLE', '게임 API가 아직 설정되지 않았습니다.');
    return this.config.profileProvider.lookup(playerTag);
  }

  async gameAccounts(req: SessionRequest) {
    const u = requireUser(req);
    return (
      await this.db.gameAccount.findMany({
        where: { userId: u.id },
        orderBy: { updatedAt: 'desc' },
      })
    ).map((a) => a.profile);
  }

  async saveGameAccount(req: SessionRequest, input: GameAccountDto) {
    const u = requireUser(req),
      profile = await this.lookup(input.playerTag);
    await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${u.id} FOR UPDATE`;
      const current = await (tx ?? this.db).user.findUniqueOrThrow({ where: { id: u.id } });
      await (tx ?? this.db).gameAccount.upsert({
        where: { userId_playerTag: { userId: u.id, playerTag: input.playerTag } },
        update: { profile: profile as unknown as Prisma.InputJsonValue },
        create: {
          userId: u.id,
          playerTag: input.playerTag,
          profile: profile as unknown as Prisma.InputJsonValue,
        },
      });
      await (tx ?? this.db).user.update({
        where: { id: u.id },
        data: {
          supercellTag: input.playerTag,
          ...(current.supercellTag !== input.playerTag ? { isVerified: false, verifiedAt: null } : {}),
        },
      });
    });
    return profile;
  }
}
