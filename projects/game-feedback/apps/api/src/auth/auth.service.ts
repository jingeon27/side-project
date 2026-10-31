import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import type { Request, Response } from 'express';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { hash, token } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { COOKIE, cookies, setCookie } from '../common/http/cookies';
import { parse } from '../common/validation';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { GameProfilesService } from '../game-profiles/game-profiles.service';
import { PrismaClient } from '../generated/prisma';
import { seed, TEST_ACCOUNT_FIXTURES } from '../seed';
import { authorDto, userDto } from '../users/user.presenter';
import { AccountWithdrawalService } from './account/account-withdrawal.service';
import { bannedIdentityError, isBannedIdentity } from './account/banned-identity';
import { SocialIdentityService } from './account/social-identity.service';
import { AppAuthService } from './app-login/app-auth.service';
import { type TDemoLoginDto, type TOnboardDto, type TTestLoginDto } from './auth-input.dto';
import { IdentityProviderRegistry } from './oauth/identity-provider.registry';
import {
  loginRedirect,
  OAUTH_RETURN_COOKIE,
  requestedReturnPath,
  savedReturnPath,
} from './oauth/oauth-return-path';
import { requireUser } from './session/session-access';
import { sessionToken } from './session/session-token';
import { SessionService } from './session/session.service';
import type { SessionRequest } from './session/session.types';

/**
 * 앱 로그인 결과는 검증된 https 콜백(App Link·Universal Link)으로만 보낸다. 코드 원문은 이 URL에만 실린다.
 * 커스텀 스킴은 다른 앱도 등록할 수 있어 그 앱이 자기 challenge로 시작한 흐름의 코드를 가로챌 수 있다.
 */
function appCallbackUrl(callbackUrl: string, params: Record<string, string>) {
  return `${callbackUrl}?${new URLSearchParams(params).toString()}`;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(AccountWithdrawalService) private readonly withdrawal: AccountWithdrawalService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AppAuthService) private readonly appAuth: AppAuthService,
    @Inject(SocialIdentityService) private readonly identities: SocialIdentityService,
    @Inject(GameProfilesService) private readonly gameProfiles: GameProfilesService,
    @Inject(IdentityProviderRegistry) private readonly providers: IdentityProviderRegistry,
  ) {}
  async demo(req: SessionRequest, res: Response, input: TDemoLoginDto) {
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

  async testLogin(req: SessionRequest, res: Response, body: TTestLoginDto) {
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

  async testToken(req: SessionRequest, res: Response, body: TTestLoginDto) {
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
    const identity = this.providers.require(provider);
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
    await this.db.oAuthAttempt.deleteMany({ where: { expiresAt: { lte: dayjs().toDate() } } });
    await this.db.oAuthAttempt.create({
      data: {
        provider,
        stateHash: hash(state),
        nonce,
        verifier,
        appChallenge,
        expiresAt: dayjs()
          .add(10 * 60 * 1000, 'millisecond')
          .toDate(),
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
    const identity = this.providers.require(provider);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || cookies(req).gamefeedback_oauth !== state)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청을 확인할 수 없습니다.');
    const attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: hash(state) } });
    if (!attempt || attempt.provider !== provider || attempt.expiresAt <= dayjs().toDate())
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 만료되었거나 올바르지 않습니다.');
    const consumed = await this.db.oAuthAttempt.deleteMany({
      where: { stateHash: hash(state), provider, expiresAt: { gt: dayjs().toDate() } },
    });
    if (consumed.count !== 1)
      throw new ApiError(400, 'OAUTH_STATE_INVALID', '로그인 요청이 이미 사용되었습니다.');
    setCookie(res, 'gamefeedback_oauth', '', 0, this.config.production);
    const returnPath = savedReturnPath(req);
    setCookie(res, OAUTH_RETURN_COOKIE, '', 0, this.config.production);
    if (!code) {
      res.redirect(
        attempt.appChallenge
          ? appCallbackUrl(this.config.appAuthCallbackUrl, { error: 'login_failed' })
          : loginRedirect(this.config.webOrigin, returnPath, 'cancelled'),
      );
      return;
    }
    const subject = await identity.exchange(code, attempt.verifier, attempt.nonce).catch((error: unknown) => {
      if (attempt.appChallenge) return null;
      throw error;
    });
    if (!subject) {
      res.redirect(appCallbackUrl(this.config.appAuthCallbackUrl, { error: 'login_failed' }));
      return;
    }
    const user = await this.identities.findUser(provider, subject);
    // A banned user who still has an account may sign in for support; only a fresh signup is refused.
    if (!user && (await isBannedIdentity(this.db, provider, subject))) {
      if (attempt.appChallenge) {
        res.redirect(appCallbackUrl(this.config.appAuthCallbackUrl, { error: 'login_failed' }));
        return;
      }
      throw bannedIdentityError();
    }
    if (attempt.appChallenge) {
      const ticket = await this.appAuth.issueTicket(subject, attempt.appChallenge, provider);
      res.redirect(appCallbackUrl(this.config.appAuthCallbackUrl, { code: ticket }));
      return;
    }
    await this.sessions.issueSession(req, res, user?.id ?? null, user ? null : subject, { provider });
    res.redirect(loginRedirect(this.config.webOrigin, returnPath, user ? undefined : 'onboarding'));
  }

  async onboard(req: SessionRequest, res: Response, input: TOnboardDto) {
    const subject = req.gfSession?.pendingSubject;
    if (!subject) throw new ApiError(401, 'ONBOARDING_REQUIRED', '소셜 로그인 후 가입을 완료해주세요.');
    const provider = parse(SocialProviderSchema, req.gfSession?.pendingProvider ?? 'google');
    const profile = input.playerTag ? await this.gameProfiles.preview(req, input.playerTag) : undefined;
    const user = await this.identities.onboard(provider, subject, input.nickname, profile);
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
    await this.withdrawal.withdraw(u.id);
    req.gfSession = null;
    setCookie(res, COOKIE, '', 0, this.config.production);
    return { ok: true };
  }
}
