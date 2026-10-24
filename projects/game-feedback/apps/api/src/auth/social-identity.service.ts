import { Inject, Injectable } from '@nestjs/common';

import type { GameProfile, TSocialProvider } from '@game-feedback/contracts';

import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { assertIdentityNotBanned } from './banned-identity';

@Injectable()
export class SocialIdentityService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}

  async findUser(provider: TSocialProvider, subject: string) {
    const identity = await this.db.socialIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: true },
    });
    if (identity) return identity.user;
    if (provider === 'google') return this.db.user.findUnique({ where: { googleSubject: subject } });
    return null;
  }

  async onboard(provider: TSocialProvider, subject: string, nickname: string, profile?: GameProfile) {
    return this.transactions.run(async (tx) => {
      await this.lockIdentity(provider, subject, tx);
      const identity = await (tx ?? this.db).socialIdentity.findUnique({
        where: { provider_subject: { provider, subject } },
        include: { user: true },
      });
      if (identity) return identity.user;
      const legacy =
        provider === 'google'
          ? await (tx ?? this.db).user.findUnique({ where: { googleSubject: subject } })
          : null;
      if (legacy) {
        await (tx ?? this.db).socialIdentity.create({ data: { provider, subject, userId: legacy.id } });
        return legacy;
      }
      await assertIdentityNotBanned(tx, provider, subject);
      return (tx ?? this.db).user.create({
        data: {
          nickname,
          termsVersion: '2026-10-16',
          ageConfirmed: true,
          ...(provider === 'google' ? { googleSubject: subject } : {}),
          role: 'USER',
          socialIdentities: { create: { provider, subject } },
          ...(profile
            ? {
                supercellTag: profile.playerTag,
                gameAccounts: {
                  create: {
                    playerTag: profile.playerTag,
                    profile: profile as unknown as Prisma.InputJsonValue,
                  },
                },
              }
            : {}),
        },
      });
    });
  }

  private lockIdentity(provider: string, subject: string, client: Prisma.TransactionClient) {
    const key = `${provider}:${subject}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}
