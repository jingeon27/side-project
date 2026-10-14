import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import type { OAuthAttempt } from '../../generated/prisma';
import { pkceChallenge, randomToken, safeEqual, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { readCookie } from '../common/http/cookie-header';
import { textValue } from '../common/validation';
import { developmentLoginEnabled, mobileAppScheme, oauthCredentials, webOrigin } from '../config/env';
import {
  APP_LOGIN_CODE_MAX_LENGTH,
  APP_LOGIN_TICKET_TTL_MS,
  OAUTH_ATTEMPT_TTL_MS,
  OAUTH_PROVIDER_TIMEOUT_MS,
  PKCE_CHALLENGE_LENGTH,
  PKCE_VERIFIER_MAX_LENGTH,
  PKCE_VERIFIER_MIN_LENGTH,
  TEXT_LIMIT,
} from '../config/limits';
import { Database } from '../database/database.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { AUTH_COOKIE, authCookieOptions } from './auth-cookie';
import { accessTokenOf, identityOf, OAUTH_PROVIDER, oauthProvider } from './oauth-provider';
import type { IOAuthIdentity, IOAuthProvider } from './oauth-provider';
import { SessionService } from './session.service';

const MESSAGE = {
  DEV_LOGIN_DISABLED: '개발 로그인이 비활성화되어 있습니다.',
  INVALID_APP_CHALLENGE: '앱 로그인 요청 형식이 올바르지 않습니다.',
  CALLBACK_REJECTED: '로그인 요청을 확인할 수 없습니다.',
  ATTEMPT_EXPIRED: '로그인 요청이 만료되었습니다.',
  ATTEMPT_USED: '이미 사용한 로그인 요청입니다.',
  PROVIDER_AUTH_FAILED: '소셜 인증에 실패했습니다.',
  PROFILE_UNAVAILABLE: '프로필을 확인할 수 없습니다.',
  IDENTITY_UNAVAILABLE: '사용자를 확인할 수 없습니다.',
} as const;

// Sentry 태그용 라우트 패턴. 실제 경로에는 provider가 들어간다.
const OAUTH_CALLBACK_ROUTE = 'GET /auth/:provider/callback';

// 앱이 만든 S256 challenge: base64url(SHA-256(verifier))
const APP_CHALLENGE = new RegExp(`^[A-Za-z0-9_-]{${PKCE_CHALLENGE_LENGTH}}$`);
// RFC 7636 unreserved 문자
const PKCE_VERIFIER = new RegExp(
  `^[A-Za-z0-9._~-]{${PKCE_VERIFIER_MIN_LENGTH},${PKCE_VERIFIER_MAX_LENGTH}}$`,
);

const devLoginSchema = z.object({ nickname: z.unknown() });
const appExchangeSchema = z.object({
  code: z.string().min(1).max(APP_LOGIN_CODE_MAX_LENGTH),
  verifier: z.string().regex(PKCE_VERIFIER),
});

export interface IAuthConfig {
  developmentLogin: boolean;
  google: boolean;
  kakao: boolean;
}

function queryValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

/** 앱 로그인 결과는 앱 scheme으로 돌려보낸다. 코드 원문은 이 URL에만 실린다. */
function appCallbackUrl(params: Record<string, string>) {
  return `${mobileAppScheme()}://auth/callback?${new URLSearchParams(params).toString()}`;
}

function parseAppChallenge(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !APP_CHALLENGE.test(value)) fail(MESSAGE.INVALID_APP_CHALLENGE);
  return value;
}

async function readJson(response: globalThis.Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly sessions: SessionService,
  ) {}

  config(): IAuthConfig {
    return {
      developmentLogin: developmentLoginEnabled(),
      google: Boolean(oauthCredentials(OAUTH_PROVIDER.GOOGLE).clientId),
      kakao: Boolean(oauthCredentials(OAUTH_PROVIDER.KAKAO).clientId),
    };
  }

  /** NODE_ENV=development와 ENABLE_DEV_LOGIN=true가 모두 있을 때만 연다. */
  async devLogin(body: unknown, res: Response) {
    if (!developmentLoginEnabled()) fail(MESSAGE.DEV_LOGIN_DISABLED, ERROR_CODE.FORBIDDEN);
    const nickname = textValue(devLoginSchema.safeParse(body).data?.nickname, TEXT_LIMIT.NICKNAME, '닉네임');
    const user = await this.db.user.upsert({
      where: { provider_providerId: { provider: 'dev', providerId: nickname } },
      create: { provider: 'dev', providerId: nickname, nickname },
      update: {},
    });
    await this.sessions.start(res, user.id);
  }

  logout(req: Request, res: Response) {
    return this.sessions.end(req, res);
  }

  /**
   * state·PKCE를 만들고 provider 인가 URL을 돌려준다.
   * app_challenge가 있으면 콜백에서 세션 대신 앱 로그인 티켓을 만든다.
   */
  async startOAuth(providerName: string, appChallenge: unknown, res: Response): Promise<string> {
    const provider = oauthProvider(providerName);
    const challenge = parseAppChallenge(appChallenge);
    const state = randomToken();
    const verifier = randomToken();
    await this.db.oAuthAttempt.create({
      data: {
        stateHash: sha256Hex(state),
        provider: provider.name,
        verifier,
        appChallenge: challenge ?? null,
        expiresAt: new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS),
      },
    });
    res.cookie(AUTH_COOKIE.OAUTH_STATE, state, authCookieOptions(OAUTH_ATTEMPT_TTL_MS));
    const url = new URL(provider.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      ...provider.authorizeParams,
    }).toString();
    return url.toString();
  }

  /**
   * provider 콜백을 처리하고 이동할 주소를 돌려준다. 실패해도 던지지 않는다.
   * 앱에서 시작한 시도로 확인되면 앱 scheme으로, 아니면 웹으로 보낸다.
   */
  async completeOAuth(providerName: string, req: Request, res: Response): Promise<string> {
    let attempt: OAuthAttempt | null = null;
    res.clearCookie(AUTH_COOKIE.OAUTH_STATE, authCookieOptions());
    try {
      const provider = oauthProvider(providerName);
      const state = queryValue(req.query.state);
      const code = queryValue(req.query.code);
      if (state) attempt = await this.db.oAuthAttempt.findUnique({ where: { stateHash: sha256Hex(state) } });
      const cookieState = readCookie(req.headers.cookie, AUTH_COOKIE.OAUTH_STATE);
      if (!state || !code || !cookieState || !safeEqual(cookieState, state))
        fail(MESSAGE.CALLBACK_REJECTED, ERROR_CODE.FORBIDDEN);
      const verified = await this.consumeAttempt(attempt, provider);
      const identity = await this.fetchIdentity(provider, code, verified.verifier);
      const user = await this.db.user.upsert({
        where: { provider_providerId: { provider: provider.name, providerId: identity.providerId } },
        create: { provider: provider.name, ...identity },
        update: { nickname: identity.nickname, avatar: identity.avatar },
      });
      if (verified.appChallenge) return await this.issueAppTicket(user.id, verified.appChallenge);
      await this.sessions.start(res, user.id);
      return `${webOrigin()}/`;
    } catch (error) {
      // 콜백은 4xx 대신 리다이렉트하므로 예상하지 못한 오류(provider 통신·DB)만 따로 보고한다.
      if (!(error instanceof GraphQLError)) reportUnexpectedError(error, { route: OAUTH_CALLBACK_ROUTE });
      return attempt?.appChallenge
        ? appCallbackUrl({ error: 'login_failed' })
        : `${webOrigin()}/?loginError=1`;
    }
  }

  /**
   * 앱이 받은 일회용 코드와 PKCE verifier를 확인하고 WebView 쿠키 저장소에 세션을 만든다.
   * 형식 오류·만료·불일치·재사용은 모두 같은 403으로 답한다.
   */
  async exchangeAppLogin(body: unknown, res: Response) {
    const parsed = appExchangeSchema.safeParse(body);
    if (!parsed.success) fail(ERROR_MESSAGE.APP_LOGIN_REJECTED, ERROR_CODE.FORBIDDEN);
    const codeHash = sha256Hex(parsed.data.code);
    const now = new Date();
    const ticket = await this.db.appLoginTicket.findUnique({ where: { codeHash } });
    if (
      !ticket ||
      ticket.expiresAt <= now ||
      !safeEqual(pkceChallenge(parsed.data.verifier), ticket.challenge)
    )
      fail(ERROR_MESSAGE.APP_LOGIN_REJECTED, ERROR_CODE.FORBIDDEN);
    // 같은 코드로 동시에 교환해도 삭제에 성공한 한 요청만 세션을 받는다.
    const consumed = await this.db.appLoginTicket.deleteMany({ where: { codeHash, expiresAt: { gt: now } } });
    if (consumed.count !== 1) fail(ERROR_MESSAGE.APP_LOGIN_REJECTED, ERROR_CODE.FORBIDDEN);
    await this.sessions.start(res, ticket.userId);
  }

  private async consumeAttempt(attempt: OAuthAttempt | null, provider: IOAuthProvider) {
    if (!attempt || attempt.provider !== provider.name || attempt.expiresAt < new Date())
      fail(MESSAGE.ATTEMPT_EXPIRED, ERROR_CODE.FORBIDDEN);
    const consumed = await this.db.oAuthAttempt.deleteMany({ where: { stateHash: attempt.stateHash } });
    if (consumed.count !== 1) fail(MESSAGE.ATTEMPT_USED, ERROR_CODE.FORBIDDEN);
    return attempt;
  }

  private async fetchIdentity(
    provider: IOAuthProvider,
    code: string,
    verifier: string,
  ): Promise<IOAuthIdentity> {
    const tokenResponse = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: provider.clientId,
        redirect_uri: provider.redirectUri,
        code,
        code_verifier: verifier,
        ...(provider.clientSecret ? { client_secret: provider.clientSecret } : {}),
      }),
      signal: AbortSignal.timeout(OAUTH_PROVIDER_TIMEOUT_MS),
    });
    const accessToken = tokenResponse.ok ? accessTokenOf(await readJson(tokenResponse)) : undefined;
    if (!accessToken) fail(MESSAGE.PROVIDER_AUTH_FAILED, ERROR_CODE.UNAUTHENTICATED);
    const profileResponse = await fetch(provider.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(OAUTH_PROVIDER_TIMEOUT_MS),
    });
    if (!profileResponse.ok) fail(MESSAGE.PROFILE_UNAVAILABLE, ERROR_CODE.UNAUTHENTICATED);
    const identity = identityOf(provider.name, await readJson(profileResponse));
    if (!identity) fail(MESSAGE.IDENTITY_UNAVAILABLE, ERROR_CODE.UNAUTHENTICATED);
    return identity;
  }

  private async issueAppTicket(userId: string, challenge: string) {
    const code = randomToken();
    await this.db.appLoginTicket.create({
      data: {
        codeHash: sha256Hex(code),
        userId,
        challenge,
        expiresAt: new Date(Date.now() + APP_LOGIN_TICKET_TTL_MS),
      },
    });
    return appCallbackUrl({ code });
  }
}
