import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, type Prisma } from '../generated/prisma';

import type { TSocialProvider } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { socialIdentityHash } from './social-identity-hash';

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
    if (identity && !identity.user.withdrawnAt) return identity.user;
    if (provider === 'google')
      return this.db.user.findFirst({ where: { googleSubject: subject, withdrawnAt: null } });
    return null;
  }

  async onboard(provider: TSocialProvider, subject: string, nickname: string) {
    return this.transactions.run(async (tx) => {
      await this.lockIdentity(provider, subject, tx);
      const identity = await (tx ?? this.db).socialIdentity.findUnique({
        where: { provider_subject: { provider, subject } },
        include: { user: true },
      });
      if (identity) {
        const user = await this.lockUser(identity.userId, tx);
        if (user && !user.withdrawnAt) return user;
      }
      const legacy =
        provider === 'google'
          ? await (tx ?? this.db).user.findUnique({ where: { googleSubject: subject } })
          : null;
      if (legacy) {
        const user = await this.lockUser(legacy.id, tx);
        if (user && !user.withdrawnAt) {
          await tx.socialIdentity.create({ data: { provider, subject, userId: user.id } });
          return user;
        }
      }
      const identityHash = socialIdentityHash(provider, subject);
      const restriction = await tx.retainedIdentityRestriction.findUnique({ where: { identityHash } });
      if (restriction) {
        const user = await this.lockUser(restriction.userId, tx);
        const current = await tx.retainedIdentityRestriction.findUnique({ where: { identityHash } });
        if (user?.bannedAt && current?.userId === user.id) {
          // 동일한 익명 행을 재사용해 여러 소셜 계정과 관리자 해제가 같은 제재를 바라본다.
          const restored = user.withdrawnAt
            ? await tx.user.update({
                where: { id: user.id },
                data: {
                  nickname,
                  withdrawnAt: null,
                  termsVersion: '2026-10-16',
                  termsAcceptedAt: new Date(),
                  ageConfirmed: true,
                  createdAt: new Date(),
                  ...(provider === 'google' ? { googleSubject: subject } : {}),
                },
              })
            : user;
          await tx.socialIdentity.create({ data: { provider, subject, userId: user.id } });
          return restored;
        }
      }
      return (tx ?? this.db).user.create({
        data: {
          nickname,
          termsVersion: '2026-10-16',
          ageConfirmed: true,
          ...(provider === 'google' ? { googleSubject: subject } : {}),
          role: provider === 'google' && process.env.GF_ADMIN_GOOGLE_SUB === subject ? 'ADMIN' : 'USER',
          socialIdentities: { create: { provider, subject } },
        },
      });
    });
  }

  private lockIdentity(provider: string, subject: string, client: Prisma.TransactionClient) {
    const key = `${provider}:${subject}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }

  private async lockUser(id: string, client: Prisma.TransactionClient) {
    await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    return client.user.findUnique({ where: { id } });
  }
}
