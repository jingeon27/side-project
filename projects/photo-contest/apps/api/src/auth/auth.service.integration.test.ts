import { createHash, randomBytes } from 'node:crypto';

import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../test/support/app';
import { cookiePair, findSetCookie } from '../../test/support/cookies';
import { jsonResponse, stubExternalFetch } from '../../test/support/external-fetch';

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_PROFILE = 'https://openidconnect.googleapis.com/v1/userinfo';
const APP_CALLBACK_URL = `${TEST_WEB_ORIGIN}/app-auth/callback`;

function pkceChallenge() {
  return createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url');
}

function locationOf(response: Response): string {
  const location: unknown = response.headers.location;
  if (typeof location !== 'string') throw new Error(`Location 헤더가 없습니다 (${response.status})`);
  return location;
}

// 감사 M3: 커스텀 스킴 콜백은 같은 스킴을 등록한 다른 앱이 자기 challenge로 시작한 흐름의 코드를 받을 수 있었다.
describe('앱 로그인 코드 전달 대상', () => {
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
  });

  async function finishAppLogin(succeeds: boolean) {
    const start = await api.http().get('/auth/google').query({ app_challenge: pkceChallenge() });
    const state = new URL(locationOf(start)).searchParams.get('state') ?? '';
    const stateCookie = cookiePair(findSetCookie(start, 'contest_oauth_state') ?? '');
    stubExternalFetch({
      [GOOGLE_TOKEN]: () =>
        succeeds ? jsonResponse({ access_token: 'provider-access-token' }) : jsonResponse({}, 400),
      [GOOGLE_PROFILE]: () => jsonResponse({ sub: 'google-m3-user', name: '링크 사용자' }),
    });
    return api
      .http()
      .get('/auth/google/callback')
      .query({ state, code: 'provider-code' })
      .set('Cookie', stateCookie);
  }

  it('커스텀 스킴이나 다른 주소를 설정해도 코드는 WEB_ORIGIN의 https 콜백으로만 보내야 한다', async () => {
    for (const configured of [
      'photocontest://auth/callback',
      'https://evil.example/app-auth/callback',
      `${TEST_WEB_ORIGIN}/app-auth/callback/extra`,
      `${TEST_WEB_ORIGIN}/app-auth/callback?next=https://evil.example`,
      `${TEST_WEB_ORIGIN}/app-auth/callback#x`,
      'javascript:alert(1)',
    ]) {
      vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', configured);
      const location = locationOf(await finishAppLogin(true));
      expect(location.slice(0, APP_CALLBACK_URL.length + 6), configured).toBe(`${APP_CALLBACK_URL}?code=`);
      expect(location.slice(APP_CALLBACK_URL.length + 6), configured).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('앱 로그인 실패도 커스텀 스킴이 아니라 https 콜백으로 알려야 한다', async () => {
    vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', 'photocontest://auth/callback');
    expect(locationOf(await finishAppLogin(false))).toBe(`${APP_CALLBACK_URL}?error=login_failed`);
  });
});
