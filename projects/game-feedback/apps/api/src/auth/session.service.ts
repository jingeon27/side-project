import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { hash, token } from '../common/crypto';
import { COOKIE, setCookie } from '../common/http/cookies';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { userDto } from '../users/user.presenter';
import { sessionToken } from './session-token';
import type { SessionRequest } from './session.types';

@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async loadSession(req: SessionRequest) {
    const raw = sessionToken(req);
    req.gfSession = raw
      ? await this.db.session.findUnique({
          where: { tokenHash: hash(raw) },
          include: { user: { include: { avatar: { select: { id: true } } } } },
        })
      : null;
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
      if (current) await (tx ?? this.db).session.deleteMany({ where: { tokenHash: hash(current) } });
      await (tx ?? this.db).session.create({
        data: {
          tokenHash: hash(raw),
          userId,
          pendingSubject,
          pendingProvider: pendingSubject ? (options.provider ?? 'google') : null,
          expiresAt,
        },
      });
    });
    setCookie(res, COOKIE, raw, maxAge, this.config.production);
    req.gfSession = await this.db.session.findUnique({
      where: { tokenHash: hash(raw) },
      include: { user: { include: { avatar: { select: { id: true } } } } },
    });
    return { accessToken: raw, expiresAt: expiresAt.toISOString() };
  }
}
