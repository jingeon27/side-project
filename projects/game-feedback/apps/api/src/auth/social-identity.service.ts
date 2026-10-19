import { UnitOfWork } from '../database/unit-of-work';
import { AuthRepository } from './auth.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { TSocialProvider } from '@game-feedback/contracts';

@Injectable()
export class SocialIdentityService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}

  async findUser(provider: TSocialProvider, subject: string) {
    const identity = await this.repository.findUniqueSocialIdentity({
      where: { provider_subject: { provider, subject } },
      include: { user: true },
    });
    if (identity) return identity.user;
    if (provider === 'google') return this.repository.findUniqueUser({ where: { googleSubject: subject } });
    return null;
  }

  async onboard(provider: TSocialProvider, subject: string, nickname: string) {
    return this.transactions.run(async (tx) => {
      await this.repository.lockIdentity(provider, subject, tx);
      const identity = await this.repository.findUniqueSocialIdentity(
        {
          where: { provider_subject: { provider, subject } },
          include: { user: true },
        },
        tx,
      );
      if (identity) return identity.user;
      const legacy =
        provider === 'google'
          ? await this.repository.findUniqueUser({ where: { googleSubject: subject } }, tx)
          : null;
      if (legacy) {
        await this.repository.createSocialIdentity({ data: { provider, subject, userId: legacy.id } }, tx);
        return legacy;
      }
      return this.repository.createUser(
        {
          data: {
            nickname,
            termsVersion: '2026-10-16',
            ageConfirmed: true,
            ...(provider === 'google' ? { googleSubject: subject } : {}),
            role: provider === 'google' && process.env.GF_ADMIN_GOOGLE_SUB === subject ? 'ADMIN' : 'USER',
            socialIdentities: { create: { provider, subject } },
          },
        },
        tx,
      );
    });
  }
}
