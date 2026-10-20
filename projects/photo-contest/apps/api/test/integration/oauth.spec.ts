import { createHash, randomBytes } from 'node:crypto';

import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN } from '../support/app';
import type { ITestApi } from '../support/app';
import {
  cookieAttributes,
  cookiePair,
  cookieValue,
  findSetCookie,
  isClearingCookie,
} from '../support/cookies';
import { formBody, jsonResponse, stubExternalFetch } from '../support/external-fetch';

const GOOGLE = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  profile: 'https://openidconnect.googleapis.com/v1/userinfo',
};
const KAKAO = {
  token: 'https://kauth.kakao.com/oauth/token',
  profile: 'https://kapi.kakao.com/v2/user/me',
};
const STATE_COOKIE = 'contest_oauth_state';
const SESSION_COOKIE = 'contest_session';
const WEB_LOGIN_ERROR = `${TEST_WEB_ORIGIN}/?loginError=1`;
const APP_LOGIN_ERROR = 'photocontest://auth/callback?error=login_failed';
const APP_LOGIN_REJECTED = { message: '앱 로그인 요청을 확인할 수 없습니다.' };
const INVALID_APP_CHALLENGE = { message: '앱 로그인 요청 형식이 올바르지 않습니다.' };

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function newVerifier() {
  return randomBytes(32).toString('base64url');
}

function locationOf(response: Response): string {
  const location: unknown = response.headers.location;
  if (typeof location !== 'string') throw new Error(`Location 헤더가 없습니다 (${response.status})`);
  return location;
}

/** provider가 인가 코드를 토큰으로, 토큰을 프로필로 바꿔 주는 응답만 경계에서 대체한다. */
function stubGoogle(profile: Record<string, unknown>) {
  return stubExternalFetch({
    [GOOGLE.token]: () => jsonResponse({ access_token: 'provider-access-token' }),
    [GOOGLE.profile]: () => jsonResponse(profile),
  });
}

describe('OAuth와 앱 로그인', () => {
  let api: ITestApi;

  beforeAll(async () => {
    api = await createTestApp();
  });

  afterAll(async () => {
    await api?.close();
  });

  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-secret');
    vi.stubEnv('KAKAO_CLIENT_ID', 'test-kakao-client');
  });

  /** OAuth를 시작하고 provider로 가는 주소와 브라우저가 받은 state 쿠키를 돌려준다. */
  async function startLogin(provider = 'google', query: Record<string, string> = {}) {
    const response = await api.http().get(`/auth/${provider}`).query(query);
    expect(response.status, response.text).toBe(302);
    const location = new URL(locationOf(response));
    const stateCookie = findSetCookie(response, STATE_COOKIE);
    expect(stateCookie).toBeDefined();
    return {
      location,
      state: location.searchParams.get('state') ?? '',
      stateCookie: stateCookie!,
      cookie: cookiePair(stateCookie!),
    };
  }

  function callback(provider: string, query: Record<string, string>, cookie?: string) {
    let pending = api.http().get(`/auth/${provider}/callback`).query(query);
    if (cookie) pending = pending.set('Cookie', cookie);
    return pending;
  }

  function exchange(body: string | object) {
    return api.http().post('/auth/app/exchange').set('Origin', TEST_WEB_ORIGIN).send(body);
  }

  /** 앱이 시작한 OAuth를 끝까지 진행해 앱 scheme으로 받은 일회용 코드를 돌려준다. */
  async function appLoginCode(verifier: string, sub: string) {
    const start = await startLogin('google', { app_challenge: pkceChallenge(verifier) });
    stubGoogle({ sub, name: '앱 친구' });
    const response = await callback('google', { state: start.state, code: 'provider-code' }, start.cookie);
    expect(response.status).toBe(302);
    const location = new URL(locationOf(response));
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe('photocontest://auth/callback');
    return location.searchParams.get('code') ?? '';
  }

  describe('웹 로그인', () => {
    it('시작하면 state와 S256 PKCE로 provider에 보내고 10분짜리 state 쿠키를 내려줘야 한다', async () => {
      const { location, state, stateCookie } = await startLogin('google');
      expect(`${location.origin}${location.pathname}`).toBe(GOOGLE.authorize);
      expect(Object.fromEntries(location.searchParams)).toEqual({
        client_id: 'test-google-client',
        redirect_uri: `${TEST_WEB_ORIGIN}/backend/auth/google/callback`,
        response_type: 'code',
        state,
        code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        code_challenge_method: 'S256',
        scope: 'openid profile',
        prompt: 'select_account',
      });
      expect(cookieValue(stateCookie)).toBe(state);
      expect(cookieAttributes(stateCookie)).toEqual(
        expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=600']),
      );

      const attempt = await api.db.oAuthAttempt.findUniqueOrThrow({ where: { stateHash: sha256Hex(state) } });
      expect(attempt).toMatchObject({ provider: 'google', appChallenge: null });
      expect(location.searchParams.get('code_challenge')).toBe(pkceChallenge(attempt.verifier));
    });

    it('다른 브라우저의 state와 만료된 시도를 거부해야 한다', async () => {
      const calls = stubExternalFetch({});
      const start = await startLogin('google');
      const other = await startLogin('google');

      const withoutCookie = await callback('google', { state: start.state, code: 'invalid' });
      expect(withoutCookie.status).toBe(302);
      expect(withoutCookie.headers.location).toBe(WEB_LOGIN_ERROR);
      const otherBrowser = await callback('google', { state: start.state, code: 'invalid' }, other.cookie);
      expect(otherBrowser.headers.location).toBe(WEB_LOGIN_ERROR);

      await api.db.oAuthAttempt.update({
        where: { stateHash: sha256Hex(start.state) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await callback('google', { state: start.state, code: 'invalid' }, start.cookie);
      expect(expired.headers.location).toBe(WEB_LOGIN_ERROR);
      // 시도 확인에서 끝나야 하므로 provider에는 아무 요청도 가지 않는다.
      expect(calls).toEqual([]);
    });

    it('provider 토큰 경계에서 PKCE verifier를 보내고 해시 세션만 저장해야 한다', async () => {
      const start = await startLogin('google');
      const attempt = await api.db.oAuthAttempt.findUniqueOrThrow({
        where: { stateHash: sha256Hex(start.state) },
      });
      const calls = stubGoogle({ sub: 'google-pkce-user', name: '소셜 친구', email: 'same@example.com' });

      const response = await callback('google', { state: start.state, code: 'mock-code' }, start.cookie);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${TEST_WEB_ORIGIN}/`);

      const [tokenCall, profileCall] = calls;
      expect(tokenCall?.url).toBe(GOOGLE.token);
      expect(Object.fromEntries(formBody(tokenCall?.init))).toEqual({
        grant_type: 'authorization_code',
        client_id: 'test-google-client',
        client_secret: 'test-google-secret',
        redirect_uri: `${TEST_WEB_ORIGIN}/backend/auth/google/callback`,
        code: 'mock-code',
        code_verifier: attempt.verifier,
      });
      expect(attempt.verifier.length).toBeGreaterThanOrEqual(43);
      expect(new Headers(profileCall?.init?.headers).get('Authorization')).toBe(
        'Bearer provider-access-token',
      );

      const sessionCookie = findSetCookie(response, SESSION_COOKIE)!;
      expect(cookieAttributes(sessionCookie)).toEqual(
        expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']),
      );
      expect(isClearingCookie(findSetCookie(response, STATE_COOKIE)!)).toBe(true);
      const rawToken = cookieValue(sessionCookie);
      expect(await api.db.session.findUnique({ where: { tokenHash: rawToken } })).toBeNull();
      expect(await api.db.session.findUnique({ where: { tokenHash: sha256Hex(rawToken) } })).not.toBeNull();
      expect(await api.gqlOk(cookiePair(sessionCookie), '{ me { nickname } }')).toEqual({
        me: { nickname: '소셜 친구' },
      });

      const reused = await callback('google', { state: start.state, code: 'mock-code' }, start.cookie);
      expect(reused.headers.location).toBe(WEB_LOGIN_ERROR);
      expect(findSetCookie(reused, SESSION_COOKIE)).toBeUndefined();
    });

    it('다른 provider의 같은 이메일 계정을 합치지 않아야 한다', async () => {
      const google = await startLogin('google');
      stubGoogle({ sub: 'google-merge-user', name: '구글 병합', email: 'merge@example.com' });
      const googleLogin = await callback('google', { state: google.state, code: 'code' }, google.cookie);

      const kakao = await startLogin('kakao');
      stubExternalFetch({
        [KAKAO.token]: () => jsonResponse({ access_token: 'kakao-access-token' }),
        [KAKAO.profile]: () =>
          jsonResponse({
            id: 4242,
            kakao_account: { email: 'merge@example.com' },
            properties: { nickname: '카카오 병합' },
          }),
      });
      const kakaoLogin = await callback('kakao', { state: kakao.state, code: 'code' }, kakao.cookie);

      const googleUser = await api.gqlOk<{ me: { id: string } }>(
        cookiePair(findSetCookie(googleLogin, SESSION_COOKIE)!),
        '{ me { id } }',
      );
      const kakaoUser = await api.gqlOk<{ me: { id: string } }>(
        cookiePair(findSetCookie(kakaoLogin, SESSION_COOKIE)!),
        '{ me { id } }',
      );
      expect(googleUser.me.id).not.toBe(kakaoUser.me.id);
      expect(
        await api.db.user.findMany({
          where: { id: { in: [googleUser.me.id, kakaoUser.me.id] } },
          select: { provider: true, providerId: true },
          orderBy: { provider: 'asc' },
        }),
      ).toEqual([
        { provider: 'google', providerId: 'google-merge-user' },
        { provider: 'kakao', providerId: '4242' },
      ]);
    });

    it('콜백은 어떤 실패에도 4xx 대신 웹 로그인 오류로 보내고 state 쿠키를 지워야 한다', async () => {
      const failures: Array<[string, () => Promise<Response>]> = [
        [
          'provider 토큰 거절',
          async () => {
            const start = await startLogin('google');
            stubExternalFetch({ [GOOGLE.token]: () => jsonResponse({ error: 'invalid_grant' }, 400) });
            return callback('google', { state: start.state, code: 'code' }, start.cookie);
          },
        ],
        [
          '프로필 조회 실패',
          async () => {
            const start = await startLogin('google');
            stubExternalFetch({
              [GOOGLE.token]: () => jsonResponse({ access_token: 'token' }),
              [GOOGLE.profile]: () => jsonResponse({}, 500),
            });
            return callback('google', { state: start.state, code: 'code' }, start.cookie);
          },
        ],
        [
          '식별자 없는 프로필',
          async () => {
            const start = await startLogin('google');
            stubGoogle({ name: '식별자 없음' });
            return callback('google', { state: start.state, code: 'code' }, start.cookie);
          },
        ],
        [
          '인가 코드 없음',
          async () => {
            const start = await startLogin('google');
            return callback('google', { state: start.state }, start.cookie);
          },
        ],
        ['지원하지 않는 provider', () => callback('unknown', { state: 'state', code: 'code' })],
        [
          '설정되지 않은 provider',
          async () => {
            const start = await startLogin('google');
            vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
            const response = await callback('google', { state: start.state, code: 'code' }, start.cookie);
            vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client');
            return response;
          },
        ],
      ];
      for (const [name, run] of failures) {
        const response = await run();
        expect(response.status, name).toBe(302);
        expect(response.headers.location, name).toBe(WEB_LOGIN_ERROR);
        expect(findSetCookie(response, SESSION_COOKIE), name).toBeUndefined();
        expect(isClearingCookie(findSetCookie(response, STATE_COOKIE) ?? ''), name).toBe(true);
      }
    });
  });

  describe('앱 로그인', () => {
    it('app_challenge를 시도에 저장하고 같은 provider 인가로 보내야 한다', async () => {
      const challenge = pkceChallenge(newVerifier());
      const { location, state } = await startLogin('google', { app_challenge: challenge });
      expect(`${location.origin}${location.pathname}`).toBe(GOOGLE.authorize);
      const attempt = await api.db.oAuthAttempt.findUniqueOrThrow({ where: { stateHash: sha256Hex(state) } });
      expect(attempt.appChallenge).toBe(challenge);
    });

    it('형식이 틀린 app_challenge는 시도를 만들지 않고 400이어야 한다', async () => {
      const valid = pkceChallenge(newVerifier());
      const before = await api.db.oAuthAttempt.count();
      const invalid = ['', valid.slice(1), `${valid}A`, `${valid.slice(1)}=`, `${valid.slice(1)}.`];
      for (const challenge of invalid) {
        const response = await api.http().get('/auth/google').query({ app_challenge: challenge });
        expect(response.status, challenge).toBe(400);
        expect(response.body).toEqual(INVALID_APP_CHALLENGE);
        expect(findSetCookie(response, STATE_COOKIE)).toBeUndefined();
      }
      const repeated = await api.http().get(`/auth/google?app_challenge=${valid}&app_challenge=${valid}`);
      expect(repeated.status).toBe(400);
      expect(await api.db.oAuthAttempt.count()).toBe(before);
    });

    it('provider 설정을 app_challenge 형식보다 먼저 확인해야 한다', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
      const response = await api.http().get('/auth/google').query({ app_challenge: 'bad' });
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ message: '이 소셜 로그인은 아직 설정되지 않았습니다.' });
    });

    it('콜백이 성공하면 세션 대신 2분짜리 일회용 코드를 앱 scheme으로 넘겨야 한다', async () => {
      const verifier = newVerifier();
      const start = await startLogin('google', { app_challenge: pkceChallenge(verifier) });
      stubGoogle({ sub: 'google-app-user', name: '앱 사용자' });

      const response = await callback('google', { state: start.state, code: 'provider-code' }, start.cookie);
      expect(response.status).toBe(302);
      const location = new URL(locationOf(response));
      expect(response.headers.location).toMatch(/^photocontest:\/\/auth\/callback\?code=[A-Za-z0-9_-]{43}$/);
      expect(findSetCookie(response, SESSION_COOKIE)).toBeUndefined();
      expect(isClearingCookie(findSetCookie(response, STATE_COOKIE)!)).toBe(true);

      const code = location.searchParams.get('code') ?? '';
      const user = await api.db.user.findUniqueOrThrow({
        where: { provider_providerId: { provider: 'google', providerId: 'google-app-user' } },
      });
      const ticket = await api.db.appLoginTicket.findUniqueOrThrow({ where: { codeHash: sha256Hex(code) } });
      expect(ticket).toMatchObject({ userId: user.id, challenge: pkceChallenge(verifier) });
      const ttl = ticket.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(110_000);
      expect(ttl).toBeLessThanOrEqual(120_000);
      expect(await api.db.session.count({ where: { userId: user.id } })).toBe(0);
    });

    it('앱에서 시작한 시도가 실패하면 앱 scheme으로 오류를 보내야 한다', async () => {
      const failing = await startLogin('google', { app_challenge: pkceChallenge(newVerifier()) });
      stubExternalFetch({ [GOOGLE.token]: () => jsonResponse({ error: 'invalid_grant' }, 400) });
      const providerFailure = await callback(
        'google',
        { state: failing.state, code: 'code' },
        failing.cookie,
      );
      expect(providerFailure.status).toBe(302);
      expect(providerFailure.headers.location).toBe(APP_LOGIN_ERROR);

      const otherBrowser = await startLogin('google', { app_challenge: pkceChallenge(newVerifier()) });
      const withoutCookie = await callback('google', { state: otherBrowser.state, code: 'code' });
      expect(withoutCookie.headers.location).toBe(APP_LOGIN_ERROR);

      const expired = await startLogin('google', { app_challenge: pkceChallenge(newVerifier()) });
      await api.db.oAuthAttempt.update({
        where: { stateHash: sha256Hex(expired.state) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expiredCallback = await callback(
        'google',
        { state: expired.state, code: 'code' },
        expired.cookie,
      );
      expect(expiredCallback.headers.location).toBe(APP_LOGIN_ERROR);
    });

    it('MOBILE_APP_SCHEME을 따르되 웹 scheme이나 틀린 형식이면 기본 scheme을 써야 한다', async () => {
      const expectations: Array<[string, string]> = [
        ['contestapp', 'contestapp://auth/callback?code='],
        ['https', 'photocontest://auth/callback?code='],
        ['Contest_App', 'photocontest://auth/callback?code='],
      ];
      for (const [scheme, prefix] of expectations) {
        vi.stubEnv('MOBILE_APP_SCHEME', scheme);
        const start = await startLogin('google', { app_challenge: pkceChallenge(newVerifier()) });
        stubGoogle({ sub: 'google-scheme-user', name: '스킴 사용자' });
        const response = await callback('google', { state: start.state, code: 'code' }, start.cookie);
        const location = locationOf(response);
        expect(location.slice(0, prefix.length), scheme).toBe(prefix);
        expect(location.slice(prefix.length), scheme).toMatch(/^[A-Za-z0-9_-]{43}$/);
      }
    });

    it('교환은 verifier가 맞으면 세션 쿠키를 만들고 코드를 한 번만 쓰게 해야 한다', async () => {
      const verifier = newVerifier();
      const code = await appLoginCode(verifier, 'google-exchange-user');

      const response = await exchange({ code, verifier });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      const sessionCookie = findSetCookie(response, SESSION_COOKIE)!;
      expect(cookieAttributes(sessionCookie)).toEqual(
        expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']),
      );
      expect(await api.gqlOk(cookiePair(sessionCookie), '{ me { nickname } }')).toEqual({
        me: { nickname: '앱 친구' },
      });
      expect(await api.db.appLoginTicket.count({ where: { codeHash: sha256Hex(code) } })).toBe(0);

      const reused = await exchange({ code, verifier });
      expect(reused.status).toBe(403);
      expect(reused.body).toEqual(APP_LOGIN_REJECTED);
      expect(findSetCookie(reused, SESSION_COOKIE)).toBeUndefined();
    });

    it('verifier가 틀리면 403이고 코드를 소모하지 않아야 한다', async () => {
      const verifier = newVerifier();
      const code = await appLoginCode(verifier, 'google-wrong-verifier');
      const wrong = await exchange({ code, verifier: newVerifier() });
      expect(wrong.status).toBe(403);
      expect(wrong.body).toEqual(APP_LOGIN_REJECTED);
      expect(findSetCookie(wrong, SESSION_COOKIE)).toBeUndefined();

      expect((await exchange({ code, verifier })).status).toBe(200);
    });

    it('형식이 틀린 요청과 만료된 코드는 같은 403이어야 한다', async () => {
      const verifier = newVerifier();
      const code = await appLoginCode(verifier, 'google-invalid-exchange');
      const invalidBodies = [
        { code, verifier: verifier.slice(1) },
        { code, verifier: `${verifier}${'a'.repeat(86)}` },
        { code, verifier: `${verifier.slice(1)}+` },
        { code: '', verifier },
        { code: 'c'.repeat(257), verifier },
        { code },
        { verifier },
      ];
      for (const body of invalidBodies) {
        const response = await exchange(body);
        expect(response.status, JSON.stringify(body)).toBe(403);
        expect(response.body).toEqual(APP_LOGIN_REJECTED);
      }

      await api.db.appLoginTicket.update({
        where: { codeHash: sha256Hex(code) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await exchange({ code, verifier });
      expect(expired.status).toBe(403);
      expect(expired.body).toEqual(APP_LOGIN_REJECTED);
    });

    it('같은 코드로 동시에 교환하면 한 요청만 세션을 받아야 한다', async () => {
      const verifier = newVerifier();
      const code = await appLoginCode(verifier, 'google-concurrent-exchange');
      const responses = await Promise.all(Array.from({ length: 6 }, () => exchange({ code, verifier })));
      expect(responses.map((response) => response.status).sort()).toEqual([200, 403, 403, 403, 403, 403]);
      expect(responses.filter((response) => findSetCookie(response, SESSION_COOKIE))).toHaveLength(1);
    });

    it('운영 모드에서 교환한 세션 쿠키는 Secure여야 한다', async () => {
      const verifier = newVerifier();
      const code = await appLoginCode(verifier, 'google-secure-exchange');
      vi.stubEnv('NODE_ENV', 'production');
      const response = await exchange({ code, verifier });
      expect(response.status).toBe(200);
      expect(cookieAttributes(findSetCookie(response, SESSION_COOKIE)!)).toContain('Secure');
    });
  });
});
