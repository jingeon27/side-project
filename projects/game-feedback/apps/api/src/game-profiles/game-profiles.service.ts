import { Inject, Injectable } from '@nestjs/common';

import { POSTS_CACHE_TAG } from '@game-feedback/contracts';

import { requireProfileLookupSession, requireUser } from '../auth/session/session-access';
import type { SessionRequest } from '../auth/session/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { type TGameAccountDto } from './game-account-input.dto';
import { ProfileLookupCache } from './profile-lookup-cache';
import type { ProfileProvider } from './providers/profile-provider';
import { PROFILE_PROVIDER } from './providers/profile-provider.factory';
import { ProfileException } from './providers/profile.exception';

/** 사용자마다 남기는 최근 게임 계정 조회 결과 수. 대표 태그는 User.supercellTag가 따로 가진다. */
export const MAX_GAME_ACCOUNTS_PER_USER = 5;

@Injectable()
export class GameProfilesService {
  private readonly lookups = new ProfileLookupCache();

  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(PROFILE_PROVIDER) private readonly profileProvider: ProfileProvider | null,
  ) {}
  async preview(req: SessionRequest, playerTag: string) {
    requireProfileLookupSession(req);
    return this.lookup(playerTag);
  }

  private async lookup(playerTag: string) {
    const provider = this.profileProvider;
    if (!provider) throw ProfileException.notConfigured();
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

  async saveGameAccount(req: SessionRequest, input: TGameAccountDto) {
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
        // 조회할 때마다 새 태그 행이 쌓이지 않도록 가장 최근에 저장한 계정만 남긴다.
        const stale = await tx.gameAccount.findMany({
          where: { userId: u.id },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: MAX_GAME_ACCOUNTS_PER_USER,
          select: { id: true },
        });
        if (stale.length)
          await tx.gameAccount.deleteMany({ where: { id: { in: stale.map((account) => account.id) } } });
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
