import { UnitOfWork } from '../database/unit-of-work';
import { GameProfilesRepository } from './game-profiles.repository';
import type { GameAccountDto } from './game-account-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class GameProfilesService {
  constructor(
    @Inject(GameProfilesRepository) private readonly repository: GameProfilesRepository,
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
      await this.repository.findManyGameAccount({ where: { userId: u.id }, orderBy: { updatedAt: 'desc' } })
    ).map((a) => a.profile);
  }

  async saveGameAccount(req: SessionRequest, input: GameAccountDto) {
    const u = requireUser(req),
      profile = await this.lookup(input.playerTag);
    await this.transactions.run(async (tx) => {
      await this.repository.lockUser(u.id, tx);
      const current = await this.repository.findUniqueOrThrowUser({ where: { id: u.id } }, tx);
      await this.repository.upsertGameAccount(
        {
          where: { userId_playerTag: { userId: u.id, playerTag: input.playerTag } },
          update: { profile: profile as unknown as Prisma.InputJsonValue },
          create: {
            userId: u.id,
            playerTag: input.playerTag,
            profile: profile as unknown as Prisma.InputJsonValue,
          },
        },
        tx,
      );
      await this.repository.updateUser(
        {
          where: { id: u.id },
          data: {
            supercellTag: input.playerTag,
            ...(current.supercellTag !== input.playerTag ? { isVerified: false, verifiedAt: null } : {}),
          },
        },
        tx,
      );
    });
    return profile;
  }
}
