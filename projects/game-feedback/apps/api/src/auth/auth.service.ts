import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  DISCOVERY_CACHE_TAG,
  POSTS_CACHE_TAG,
  SocialProviderSchema,
  type TSocialProvider,
} from '@game-feedback/contracts';

import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { hash, token } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { COOKIE, cookies, setCookie } from '../common/http/cookies';
import { parse } from '../common/validation';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient } from '../generated/prisma';
import { seed, TEST_ACCOUNT_FIXTURES } from '../seed';
import { authorDto, userDto } from '../users/user.presenter';
import { AppAuthService } from './app-auth.service';
import { type DemoLoginDto, type OnboardDto, type TestLoginDto } from './auth-input.dto';
import { bannedIdentityError, isBannedIdentity, recordBannedIdentities } from './banned-identity';
import {
  loginRedirect,
  OAUTH_RETURN_COOKIE,
  requestedReturnPath,
  savedReturnPath,
} from './oauth-return-path';
import { requireUser } from './session-access';
import { sessionToken } from './session-token';
import { SessionService } from './session.service';
import type { SessionRequest } from './session.types';
import { SocialIdentityService } from './social-identity.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AppAuthService) private readonly appAuth: AppAuthService,
    @Inject(SocialIdentityService) private readonly identities: SocialIdentityService,
  ) {}
  async demo(req: SessionRequest, res: Response, input: DemoLoginDto) {
    if (!this.config.demoMode) throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
    const user = await this.db.user.upsert({
      where: { demoKey: `demo:${input.nickname.toLocaleLowerCase()}` },
      update: {},
      create: {
        nickname: input.nickname,
        demoKey: `demo:${input.nickname.toLocaleLowerCase()}`,
        termsVersion: 'demo',
        ageConfirmed: true,
      },
    });
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  private requireTestAuth() {
    if (!this.config.testAuthEnabled || this.config.production)
      throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
  }

  async testAccounts() {
    this.requireTestAuth();
    await seed(this.db, true);
    const users = await this.db.user.findMany({
      where: { OR: TEST_ACCOUNT_FIXTURES.map((account) => ({ id: account.id, demoKey: account.demoKey })) },
    });
    return {
      items: TEST_ACCOUNT_FIXTURES.flatMap((account) => {
        const user = users.find((candidate) => candidate.id === account.id);
        return user
          ? [{ ...authorDto(user), isTestAccount: true, role: user.role, description: account.description }]
          : [];
      }),
    };
  }

  async testLogin(req: SessionRequest, res: Response, body: TestLoginDto) {
    this.requireTestAuth();
    const { accountId } = body;
    const fixture = TEST_ACCOUNT_FIXTURES.find((account) => account.id === accountId);
    if (!fixture) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '사용할 수 없는 테스트 계정입니다.');
    await seed(this.db, true);
    const user = await this.db.user.findFirst({ where: { id: fixture.id, demoKey: fixture.demoKey } });
    if (!user) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '테스트 계정을 찾을 수 없습니다.');
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  async testToken(req: SessionRequest, res: Response, body: TestLoginDto) {
    this.requireTestAuth();
    const { accountId } = body;
    const fixture = TEST_ACCOUNT_FIXTURES.find((account) => account.id === accountId);
    if (!fixture) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '사용할 수 없는 테스트 계정입니다.');
    await seed(this.db, true);
    const user = await this.db.user.findFirst({ where: { id: fixture.id, demoKey: fixture.demoKey } });
    if (!user) throw new ApiError(404, 'TEST_ACCOUNT_NOT_FOUND', '테스트 계정을 찾을 수 없습니다.');
    const issued = await this.sessions.issueSession(req, res, user.id, null, { durationMs: 60 * 60 * 1000 });
    res.setHeader('Cache-Control', 'no-store');
    return { ...issued, tokenType: 'Bearer' as const, user: userDto(user) };
  }

  google(req: Request, res: Response) {
    return this.social(req, res, 'google');
  }

  googleCallback(req: SessionRequest, res: Response) {
    return this.socialCallback(req, res, 'google');
  }

  async social(req: Request, res: Response, name: TSocialProvider) {
    const provider = name;
    const identity = this.config.identityProviders[provider];
    if (!identity) throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', '소셜 로그인이 아직 설정되지 않았습니다.');
    const returnPath = requestedReturnPath(req);
    const appChallenge = req.query.app_challenge;
    if (
      appChallenge !== undefined &&
      (typeof appChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(appChallenge))
    )
      throw new ApiError(400, 'APP_CHALLENGE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const state = token();
    const nonce = token();
    const verifier = token();
    // Abandoned attempts are only removed here; the table stays bounded by the auth rate limit × 10 minutes.
    await this.db.oAuthAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.db.oAuthAttempt.create({
      data: {
        provider,
        stateHash: hash(state),
        nonce,
        verifier,
        appChallenge,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    setCookie(res, 'gamefeedback_oauth', state, 10 * 60 * 1000, this.config.production);
    setCookie(
      res,
      OAUTH_RETURN_COOKIE,
      Buffer.from(returnPath).toString('base64url'),
      10 * 60 * 1000,
      this.config.production,
    );
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    res.redirect(identity.authorizationUrl({ state, nonce, challenge }));
  }

  async socialCallback(req: SessionRequest, res: Response, name: TSocialProvider) {
    const provider = name;
    const identity = this.config.identityProviders[provider];
    if (!identity) throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', '소셜 로그인이 아직 설정되지 않았습니다.');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || cookies(req).gamefeedback_oauth !== state)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: hash(state) } });
    if (!attempt || attempt.provider !== provider || attempt.expiresAt <= new Date())
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 만료되었거나 올바르지 않습니다.');
    const consumed = await this.db.oAuthAttempt.deleteMany({
      where: { stateHash: hash(state), provider, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 이미 사용되었습니다.');
    setCookie(res, 'gamefeedback_oauth', '', 0, this.config.production);
    const returnPath = savedReturnPath(req);
    setCookie(res, OAUTH_RETURN_COOKIE, '', 0, this.config.production);
    if (!code) {
      res.redirect(
        attempt.appChallenge
          ? 'gamefeedback://auth/callback?error=login_failed'
          : loginRedirect(this.config.webOrigin, returnPath, 'cancelled'),
      );
      return;
    }
    const subject = await identity.exchange(code, attempt.verifier, attempt.nonce).catch((error: unknown) => {
      if (attempt.appChallenge) return null;
      throw error;
    });
    if (!subject) {
      res.redirect('gamefeedback://auth/callback?error=login_failed');
      return;
    }
    const user = await this.identities.findUser(provider, subject);
    // A banned user who still has an account may sign in for support; only a fresh signup is refused.
    if (!user && (await isBannedIdentity(this.db, provider, subject))) {
      if (attempt.appChallenge) {
        res.redirect('gamefeedback://auth/callback?error=login_failed');
        return;
      }
      throw bannedIdentityError();
    }
    if (provider === 'google' && user && process.env.GF_ADMIN_GOOGLE_SUB === subject && user.role !== 'ADMIN')
      await this.db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    if (attempt.appChallenge) {
      const ticket = await this.appAuth.issueTicket(subject, attempt.appChallenge, provider);
      res.redirect(`gamefeedback://auth/callback?code=${ticket}`);
      return;
    }
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : subject, { provider });
    res.redirect(loginRedirect(this.config.webOrigin, returnPath, user ? undefined : 'onboarding'));
  }

  async onboard(req: SessionRequest, res: Response, input: OnboardDto) {
    const subject = req.gfSession?.pendingSubject;
    if (!subject) throw new ApiError(401, 'ONBOARDING_REQUIRED', '소셜 로그인 후 가입을 완료해주세요.');
    const provider = parse(SocialProviderSchema, req.gfSession?.pendingProvider ?? 'google');
    const user = await this.identities.onboard(provider, subject, input.nickname);
    await this.sessions.issueSession(req, res, user.id);
    return this.sessions.session(req);
  }

  async logout(req: SessionRequest, res: Response) {
    const raw = sessionToken(req);
    if (raw) await this.db.session.deleteMany({ where: { tokenHash: hash(raw) } });
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }

  async deleteAccount(req: SessionRequest, res: Response) {
    const u = requireUser(req);
    await this.cache.change(
      async (tx) => {
        // Serialize with AdminUsersService.ban so a ban racing the deletion is still recorded.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${u.id} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({ where: { id: u.id }, select: { bannedAt: true } });
        if (current.bannedAt) await recordBannedIdentities(tx, u.id);
        await (tx ?? this.db).post.deleteMany({ where: { authorId: u.id } });
        await (tx ?? this.db).answer.deleteMany({ where: { authorId: u.id } });
        await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "authorId" = ${u.id} ORDER BY "id" FOR UPDATE`;
        // 타인의 답글은 탈퇴한 원댓글에서 분리해 보존한다. Prisma의 @updatedAt이 답글을 "(수정됨)"으로
        // 바꾸지 않도록 raw SQL로 parentId만 비운다.
        await tx.$executeRaw`UPDATE "Comment" SET "parentId" = NULL WHERE "parentId" IN (SELECT "id" FROM "Comment" WHERE "authorId" = ${u.id})`;
        await (tx ?? this.db).comment.deleteMany({ where: { authorId: u.id } });
        await (tx ?? this.db).notification.deleteMany({ where: { actorId: u.id } });
        await (tx ?? this.db).user.delete({ where: { id: u.id } });
      },
      [POSTS_CACHE_TAG, DISCOVERY_CACHE_TAG],
    );
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }
}
