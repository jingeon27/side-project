import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import type { Response } from 'express';
import type { SessionRequest } from './session.types';
import { COOKIE, cookies, setCookie } from '../common/http/cookies';
import { hash, token } from '../common/crypto';
import { userDto } from '../users/user.presenter';

@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async loadSession(req: SessionRequest) {
    const raw = cookies(req)[COOKIE];
    req.gfSession = raw
      ? await this.db.session.findUnique({ where: { tokenHash: hash(raw) }, include: { user: true } })
      : null;
    if (
      req.gfSession &&
      (req.gfSession.expiresAt.getTime() <= Date.now() ||
        (!this.config.demoMode && req.gfSession.user?.demoKey))
    )
      req.gfSession = null;
  }

  session(req: SessionRequest) {
    return {
      user: req.gfSession?.user ? userDto(req.gfSession.user) : null,
      demoMode: this.config.demoMode,
      googleConfigured: !!this.config.identityProvider,
      needsOnboarding: !!req.gfSession?.pendingSubject,
    };
  }

  async issueSession(
    req: SessionRequest,
    res: Response,
    userId: string | null,
    pendingSubject: string | null = null,
  ) {
    const raw = token(),
      maxAge = userId ? 1000 * 60 * 60 * 24 * 14 : 1000 * 60 * 15;
    const current = cookies(req)[COOKIE];
    await this.db.$transaction(async (tx) => {
      if (current) await tx.session.deleteMany({ where: { tokenHash: hash(current) } });
      await tx.session.create({
        data: { tokenHash: hash(raw), userId, pendingSubject, expiresAt: new Date(Date.now() + maxAge) },
      });
    });
    setCookie(res, COOKIE, raw, maxAge, this.config.production);
    req.gfSession = await this.db.session.findUnique({
      where: { tokenHash: hash(raw) },
      include: { user: true },
    });
  }
}
