import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { type TSocialProvider } from '@game-feedback/contracts';

import { ADMIN_COOKIE, isAdminPath } from '../../admin/auth/admin-session';
import { hash, token } from '../../common/crypto';
import { ApiError } from '../../common/http/api-error';
import { COOKIE, cookies, setCookie } from '../../common/http/cookies';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient } from '../../generated/prisma';
import { userDto } from '../../users/user.presenter';
import { IdentityProviderRegistry } from '../oauth/identity-provider.registry';
import { sessionToken } from './session-token';
import type { SessionRequest } from './session.types';

@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(IdentityProviderRegistry) private readonly providers: IdentityProviderRegistry,
  ) {}
  async loadSession(req: SessionRequest) {
    if (isAdminPath(req.path)) {
      const raw = cookies(req)[ADMIN_COOKIE];
      const session = raw
        ? await this.db.adminSession.findUnique({
            where: { tokenHash: hash(raw) },
            include: { account: { include: { user: { include: { avatar: { select: { id: true } } } } } } },
          })
        : null;
      req.gfSession =
        session &&
        session.expiresAt.getTime() > Date.now() &&
        !session.account.disabledAt &&
        !session.account.user.bannedAt &&
        !session.account.user.withdrawnAt &&
        session.account.user.role === 'ADMIN'
          ? {
              ...session,
              userId: session.account.userId,
              user: session.account.user,
              pendingSubject: null,
              pendingProvider: null,
            }
          : null;
      if (raw || process.env.ENVIRONMENT !== 'test') return;
      // Legacy role fixtures are confined to the test runner; running services require the dedicated admin cookie.
    }
    const raw = sessionToken(req);
    req.gfSession = raw
      ? await this.db.session.findUnique({
          where: { tokenHash: hash(raw) },
          include: { user: { include: { avatar: { select: { id: true } } } } },
        })
      : null;
    if (
      req.gfSession?.userId &&
      (await this.db.adminAccount.findUnique({ where: { userId: req.gfSession.userId } }))
    )
      req.gfSession = null;
    if (
      req.gfSession &&
      (req.gfSession.expiresAt.getTime() <= Date.now() ||
        req.gfSession.user?.withdrawnAt ||
        (!this.config.demoMode && !this.config.testAuthEnabled && req.gfSession.user?.demoKey))
    )
      req.gfSession = null;
  }

  session(req: SessionRequest) {
    return {
      user: req.gfSession?.user ? userDto(req.gfSession.user) : null,
      demoMode: this.config.demoMode,
      googleConfigured: this.providers.configured('google'),
      socialProviders: this.providers.availability(),
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
      if (userId) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        const admin = await tx.adminAccount.findUnique({ where: { userId } });
        if (!user || user.withdrawnAt || admin)
          throw new ApiError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
      }
      // Expired rows are never read again (loadSession treats them as signed out); prune them on issuance.
      await tx.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
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
