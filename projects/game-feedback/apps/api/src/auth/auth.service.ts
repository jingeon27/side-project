import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import { seed } from '../seed';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { hash, token } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { COOKIE, cookies, setCookie } from '../common/http/cookies';
import { parse } from '../common/validation';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { TEST_ACCOUNT_FIXTURES } from '../seed';
import { authorDto, userDto } from '../users/user.presenter';
import { AppAuthService } from './app-auth.service';
import { type DemoLoginDto, type OnboardDto, type TestLoginDto } from './auth-input.dto';
import { requireUser } from './session-access';
import { sessionToken } from './session-token';
import { SessionService } from './session.service';
import type { SessionRequest } from './session.types';
import { SocialIdentityService } from './social-identity.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
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
    const appChallenge = req.query.app_challenge;
    if (
      appChallenge !== undefined &&
      (typeof appChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(appChallenge))
    )
      throw new ApiError(400, 'APP_CHALLENGE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const state = token();
    const nonce = token();
    const verifier = token();
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
    if (!code) {
      res.redirect(
        attempt.appChallenge
          ? 'gamefeedback://auth/callback?error=login_failed'
          : `${this.config.webOrigin}/ko?login=cancelled`,
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
    if (provider === 'google' && user && process.env.GF_ADMIN_GOOGLE_SUB === subject && user.role !== 'ADMIN')
      await this.db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    if (attempt.appChallenge) {
      const ticket = await this.appAuth.issueTicket(subject, attempt.appChallenge, provider);
      res.redirect(`gamefeedback://auth/callback?code=${ticket}`);
      return;
    }
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : subject, { provider });
    res.redirect(`${this.config.webOrigin}/ko${user ? '' : '?onboard=1'}`);
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
    await this.transactions.run(async (tx) => {
      await (tx ?? this.db).post.deleteMany({ where: { authorId: u.id } });
      await (tx ?? this.db).answer.deleteMany({ where: { authorId: u.id } });
      await (tx ?? this.db).comment.deleteMany({ where: { authorId: u.id } });
      await (tx ?? this.db).notification.deleteMany({ where: { actorId: u.id } });
      await (tx ?? this.db).user.delete({ where: { id: u.id } });
    });
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }
}
