import { Inject, Injectable } from '@nestjs/common';

import { POSTS_CACHE_TAG } from '@game-feedback/contracts';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ApiError } from '../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient, type Prisma } from '../generated/prisma';
import type { GameAccountDto } from './game-account-input.dto';
import { ProfileLookupCache } from './profile-lookup-cache';

@Injectable()
export class GameProfilesService {
  private readonly lookups = new ProfileLookupCache();

  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async preview(req: SessionRequest, playerTag: string) {
    requireUser(req);
    return this.lookup(playerTag);
  }

  private async lookup(playerTag: string) {
    const provider = this.config.profileProvider;
    if (!provider) throw new ApiError(503, 'PROFILE_UNAVAILABLE', '게임 API가 아직 설정되지 않았습니다.');
    return this.lookups.get(playerTag, () => provider.lookup(playerTag));
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
    await this.cache.change(
      async (tx) => {
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
      },
      [POSTS_CACHE_TAG],
    );
    return profile;
  }
}
