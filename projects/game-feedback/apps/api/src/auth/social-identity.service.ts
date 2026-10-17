import { Inject, Injectable } from '@nestjs/common';
import type { TSocialProvider } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class SocialIdentityService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  async findUser(provider: TSocialProvider, subject: string) {
    const identity = await this.db.socialIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: true },
    });
    if (identity) return identity.user;
    if (provider === 'google') return this.db.user.findUnique({ where: { googleSubject: subject } });
    return null;
  }

  async onboard(provider: TSocialProvider, subject: string, nickname: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${provider}:${subject}`}, 0))::text`;
      const identity = await tx.socialIdentity.findUnique({
        where: { provider_subject: { provider, subject } },
        include: { user: true },
      });
      if (identity) return identity.user;
      const legacy =
        provider === 'google' ? await tx.user.findUnique({ where: { googleSubject: subject } }) : null;
      if (legacy) {
        await tx.socialIdentity.create({ data: { provider, subject, userId: legacy.id } });
        return legacy;
      }
      return tx.user.create({
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
}
