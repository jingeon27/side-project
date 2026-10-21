import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, inject, it } from 'vitest';

import { encodeBase64Url } from '@/shared/lib/base64url';

import {
  buildAuthCallbackUrl,
  buildSocialLoginUrl,
  PKCE_VERIFIER_BYTES,
  readAuthCallback,
} from './social-login';

const apiUrl = inject('apiUrl');
const webOrigin = inject('webOrigin');
const CALLBACK_URL = buildAuthCallbackUrl('photocontest');
const APP_LOGIN_REJECTED = '앱 로그인 요청을 확인할 수 없습니다.';

/** 앱의 auth.socialLogin과 같은 방식으로 verifier와 challenge를 만든다. */
function createPkcePair() {
  const verifier = encodeBase64Url(new Uint8Array(randomBytes(PKCE_VERIFIER_BYTES)));
  const challenge = encodeBase64Url(new Uint8Array(createHash('sha256').update(verifier).digest()));
  return { verifier, challenge };
}

function startLogin(challenge: string) {
  return fetch(buildSocialLoginUrl(apiUrl, 'google', challenge), { redirect: 'manual' });
}

function exchange(body: unknown, headers: Record<string, string> = { Origin: webOrigin }) {
  return fetch(`${apiUrl}/auth/app/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('소셜 로그인 핸드오프 API', () => {
  it('앱 challenge로 시작하면 provider 인가 주소로 보내고 state 쿠키를 심어야 한다', async () => {
    const { challenge } = createPkcePair();

    const response = await startLogin(challenge);

    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('client_id')).toBe('mobile-test-client');
    expect(location.searchParams.get('redirect_uri')).toBe(`${webOrigin}/backend/auth/google/callback`);
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();
    // provider에 보내는 challenge는 서버 자신의 PKCE 값이다. 앱 challenge가 밖으로 새지 않아야 한다.
    expect(location.toString()).not.toContain(challenge);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('contest_oauth_state='))).toBe(
      true,
    );
  });

  it('형식이 틀린 app_challenge는 400이어야 한다', async () => {
    const { challenge } = createPkcePair();

    for (const invalid of [
      challenge.slice(1),
      `${challenge}x`,
      `${challenge.slice(1)}+`,
      `${challenge.slice(1)}=`,
    ]) {
      const response = await startLogin(invalid);
      expect(response.status, invalid).toBe(400);
    }
  });

  it('앱에서 시작한 로그인이 실패하면 앱 콜백으로 실패를 돌려주고, 앱은 그것을 실패로 읽어야 한다', async () => {
    const { challenge } = createPkcePair();
    const started = await startLogin(challenge);
    const state = new URL(started.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const stateCookie =
      started.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('contest_oauth_state='))
        ?.split(';')[0] ?? '';

    const callback = await fetch(
      `${apiUrl}/auth/google/callback?state=${encodeURIComponent(state)}&error=access_denied`,
      { redirect: 'manual', headers: { Cookie: stateCookie } },
    );

    expect(callback.status).toBe(302);
    const location = callback.headers.get('location') ?? '';
    expect(location).toBe(`${CALLBACK_URL}?error=login_failed`);
    expect(readAuthCallback(location, CALLBACK_URL)).toEqual({ error: 'login_failed' });
    expect(callback.headers.getSetCookie().some((cookie) => cookie.startsWith('contest_session='))).toBe(
      false,
    );
  });

  it('엉터리 code와 verifier로 교환하면 403이어야 한다', async () => {
    const { verifier } = createPkcePair();

    const response = await exchange({ code: 'a'.repeat(43), verifier });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ message: APP_LOGIN_REJECTED });
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('contest_session='))).toBe(
      false,
    );
  });

  it('형식이 틀린 교환 요청도 같은 403이어야 한다', async () => {
    const response = await exchange({ code: 'short', verifier: 'not a verifier' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ message: APP_LOGIN_REJECTED });
  });

  it('Origin이 없으면 교환 요청을 403으로 막아야 한다', async () => {
    const { verifier } = createPkcePair();

    const response = await exchange({ code: 'a'.repeat(43), verifier }, {});

    expect(response.status).toBe(403);
  });
});
