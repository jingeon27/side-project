import dayjs from 'dayjs';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { hash } from '../common/crypto';
import { resolveAppConfig } from '../config/app.config';
import type { GameProfilesService } from '../game-profiles/game-profiles.service';
import type { PrismaClient } from '../generated/prisma';
import type { AccountWithdrawalService } from './account/account-withdrawal.service';
import type { SocialIdentityService } from './account/social-identity.service';
import type { AppAuthService } from './app-login/app-auth.service';
import { AuthService } from './auth.service';
import { IdentityProviderRegistry } from './oauth/identity-provider.registry';
import { OAUTH_RETURN_COOKIE } from './oauth/oauth-return-path';
import { OAuthException } from './oauth/oauth.exception';
import type { SessionService } from './session/session.service';
import type { SessionRequest } from './session/session.types';

const origin = 'http://localhost:3300';
const state = 'oauth-state';

/** DB·HTTP 없이 콜백의 실패 경로만 본다. 시도·밴 기록만 가짜로 둔다. */
function callback({
  cookie = `gamefeedback_oauth=${state}; ${OAUTH_RETURN_COOKIE}=${Buffer.from('/en/settings').toString('base64url')}`,
  attempt = { appChallenge: null as string | null, provider: 'google', expiresInMinutes: 5 },
  exchange = vi.fn(async () => 'google-subject'),
  banned = false,
  code = 'code',
}: {
  cookie?: string;
  attempt?: { appChallenge: string | null; provider: string; expiresInMinutes: number } | null;
  exchange?: () => Promise<string>;
  banned?: boolean;
  code?: string;
} = {}) {
  const db = {
    oAuthAttempt: {
      findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) =>
        attempt && where.stateHash === hash(state)
          ? {
              provider: attempt.provider,
              appChallenge: attempt.appChallenge,
              verifier: 'verifier',
              nonce: 'nonce',
              expiresAt: dayjs().add(attempt.expiresInMinutes, 'minute').toDate(),
            }
          : null,
      ),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    bannedIdentity: { findUnique: vi.fn(async () => (banned ? { provider: 'google' } : null)) },
  };
  const sessions = { issueSession: vi.fn() };
  const service = new AuthService(
    db as unknown as PrismaClient,
    {} as AccountWithdrawalService,
    resolveAppConfig({
      databaseUrl:
        'postgresql://game_feedback:fixture@localhost:55444/game_feedback_test?schema=gf_test_unit',
      webOrigin: origin,
      mediaStorage: { bucket: 'unused-fixture', region: 'ap-northeast-2', forcePathStyle: false },
    }),
    sessions as unknown as SessionService,
    { issueTicket: vi.fn() } as unknown as AppAuthService,
    { findUser: vi.fn(async () => null) } as unknown as SocialIdentityService,
    {} as GameProfilesService,
    new IdentityProviderRegistry({ google: { authorizationUrl: vi.fn(), exchange } }),
  );
  const res = { redirect: vi.fn(), cookie: vi.fn() };
  const req = { query: { state, code }, headers: { cookie } } as unknown as SessionRequest;
  return {
    sessions,
    res,
    run: async () => {
      await service.socialCallback(req, res as unknown as Response, 'google');
      return new URL(String(res.redirect.mock.calls[0]?.[0]));
    },
  };
}

describe('웹 소셜 로그인 콜백 실패', () => {
  it.each([
    ['state 쿠키가 없는 다른 브라우저 문맥은', { cookie: '' }, '/ko'],
    ['찾을 수 없는 로그인 시도는', { attempt: null }, '/en/settings'],
    [
      '만료된 로그인 시도는',
      { attempt: { appChallenge: null, provider: 'google', expiresInMinutes: -1 } },
      '/en/settings',
    ],
  ])('%s JSON 오류 대신 만료 이유와 함께 로그인 화면으로 돌아간다', async (_name, input, returnTo) => {
    const { run, sessions } = callback(input);
    const destination = await run();
    expect(destination.origin).toBe(origin);
    expect(destination.pathname).toBe(returnTo === '/ko' ? '/ko/login' : '/en/login');
    expect(destination.searchParams.get('returnTo')).toBe(returnTo);
    expect(destination.searchParams.get('login')).toBe('expired');
    expect(sessions.issueSession).not.toHaveBeenCalled();
  });

  it('제공자 교환 실패와 밴 식별자는 각 이유를 붙여 로그인 화면으로 보낸다', async () => {
    const failed = callback({
      exchange: vi.fn(async () => {
        throw OAuthException.exchangeFailed('Google');
      }),
    });
    expect((await failed.run()).searchParams.get('login')).toBe('failed');
    const banned = callback({ banned: true });
    const destination = await banned.run();
    expect(destination.pathname).toBe('/en/login');
    expect(destination.searchParams.get('login')).toBe('banned');
    expect(banned.sessions.issueSession).not.toHaveBeenCalled();
  });

  it('제공자 화면에서 취소하면 로그인 화면이 아니라 시작한 화면으로 돌아간다', async () => {
    const { run, sessions } = callback({ code: '' });
    const destination = await run();
    expect(destination.pathname).toBe('/en/settings');
    expect(destination.searchParams.get('login')).toBe('cancelled');
    expect(sessions.issueSession).not.toHaveBeenCalled();
  });

  it('앱에서 시작한 시도의 실패는 계속 앱 콜백으로 알린다', async () => {
    const { run } = callback({
      attempt: { appChallenge: 'a'.repeat(43), provider: 'google', expiresInMinutes: 5 },
      exchange: vi.fn(async () => {
        throw OAuthException.exchangeFailed('Google');
      }),
    });
    expect((await run()).href).toBe(`${origin}/app-auth/callback?error=login_failed`);
  });
});
