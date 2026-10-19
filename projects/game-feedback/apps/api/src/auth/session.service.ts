import { UnitOfWork } from '../database/unit-of-work';
import { AuthRepository } from './auth.repository';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { Response } from 'express';
import type { SessionRequest } from './session.types';
import { COOKIE, setCookie } from '../common/http/cookies';
import { hash, token } from '../common/crypto';
import { userDto } from '../users/user.presenter';
import { sessionToken } from './session-token';
import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

@Injectable()
export class SessionService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async loadSession(req: SessionRequest) {
    const raw = sessionToken(req);
    req.gfSession = raw ? await this.repository.sessionWithUser(hash(raw)) : null;
    if (
      req.gfSession &&
      (req.gfSession.expiresAt.getTime() <= Date.now() ||
        (!this.config.demoMode && !this.config.testAuthEnabled && req.gfSession.user?.demoKey))
    )
      req.gfSession = null;
  }

  session(req: SessionRequest) {
    return {
      user: req.gfSession?.user ? userDto(req.gfSession.user) : null,
      demoMode: this.config.demoMode,
      googleConfigured: !!this.config.identityProvider,
      socialProviders: SocialProviderSchema.options.map((provider) => ({
        provider,
        configured: !!this.config.identityProviders[provider],
      })),
      needsOnboarding: !!req.gfSession?.pendingSubject,
    };
  }

  async issueSession(
    req: SessionRequest,
    res: Response,
    userId: string | null,
    pendingSubject: string | null = null,
    options: { durationMs?: number; provider?: TSocialProvider } = {},
  ) {
    const raw = token(),
      maxAge = options.durationMs ?? (userId ? 1000 * 60 * 60 * 24 * 14 : 1000 * 60 * 15);
    const expiresAt = new Date(Date.now() + maxAge);
    const current = sessionToken(req);
    await this.transactions.run(async (tx) => {
      if (current) await this.repository.deleteManySession({ where: { tokenHash: hash(current) } }, tx);
      await this.repository.createSession(
        {
          data: {
            tokenHash: hash(raw),
            userId,
            pendingSubject,
            pendingProvider: pendingSubject ? (options.provider ?? 'google') : null,
            expiresAt,
          },
        },
        tx,
      );
    });
    setCookie(res, COOKIE, raw, maxAge, this.config.production);
    req.gfSession = await this.repository.sessionWithUser(hash(raw));
    return { accessToken: raw, expiresAt: expiresAt.toISOString() };
  }
}
