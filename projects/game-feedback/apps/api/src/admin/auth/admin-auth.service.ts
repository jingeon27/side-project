import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { SessionService } from '../../auth/session.service';
import type { SessionRequest } from '../../auth/session.types';
import { hash, token } from '../../common/crypto';
import { ApiError } from '../../common/http/api-error';
import { cookies } from '../../common/http/cookies';
import { PrismaClient } from '../../generated/prisma';
import type { AdminLoginDto } from './admin-auth-input.dto';
import { verifyAdminPassword } from './admin-password';
import { ADMIN_COOKIE, ADMIN_SESSION_MS, setAdminCookie } from './admin-session';

// A real derivation even for an unknown ID avoids a fast account-existence check.
const unknownPassword = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  async login(req: SessionRequest, res: Response, input: AdminLoginDto) {
    const account = await this.db.adminAccount.findUnique({
      where: { username: input.username },
      include: { user: true },
    });
    const valid = await verifyAdminPassword(input.password, account?.passwordHash ?? unknownPassword);
    if (
      !valid ||
      !account ||
      account.disabledAt ||
      account.user.bannedAt ||
      account.user.withdrawnAt ||
      account.user.role !== 'ADMIN'
    )
      throw new ApiError(401, 'INVALID_ADMIN_CREDENTIALS', '아이디 또는 비밀번호를 확인해주세요.');
    const raw = token();
    const previous = cookies(req)[ADMIN_COOKIE];
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AdminAccount" WHERE "id" = ${account.id} FOR UPDATE`;
      const current = await tx.adminAccount.findUnique({
        where: { id: account.id },
        include: { user: true },
      });
      if (
        !current ||
        current.passwordHash !== account.passwordHash ||
        current.disabledAt ||
        current.user.bannedAt ||
        current.user.withdrawnAt ||
        current.user.role !== 'ADMIN'
      )
        throw new ApiError(401, 'INVALID_ADMIN_CREDENTIALS', '아이디 또는 비밀번호를 확인해주세요.');
      await tx.adminSession.deleteMany({
        where: {
          OR: [{ expiresAt: { lte: new Date() } }, ...(previous ? [{ tokenHash: hash(previous) }] : [])],
        },
      });
      await tx.adminSession.create({
        data: {
          accountId: account.id,
          tokenHash: hash(raw),
          expiresAt: new Date(Date.now() + ADMIN_SESSION_MS),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: account.userId,
          action: 'ADMIN_LOGIN',
          targetType: 'ADMIN_ACCOUNT',
          targetId: account.id,
          detail: 'Password login through the private admin service.',
        },
      });
    });
    setAdminCookie(res, raw, ADMIN_SESSION_MS);
    req.headers.cookie = `${ADMIN_COOKIE}=${raw}`;
    await this.sessions.loadSession(req);
    return this.sessions.session(req);
  }
  async logout(req: SessionRequest, res: Response) {
    const raw = cookies(req)[ADMIN_COOKIE];
    if (raw) await this.db.adminSession.deleteMany({ where: { tokenHash: hash(raw) } });
    setAdminCookie(res, '', 0);
    req.gfSession = null;
    return { ok: true };
  }
}
