import { describe, expect, it } from 'vitest';

import { buildAuthCallbackUrl } from '@/shared/config/app-links';

import { buildSocialLoginUrl, readAuthCallback } from './social-login';

const CALLBACK = buildAuthCallbackUrl('https://contest.example');
const CODE = 'Q2hhbGxlbmdlLWNvZGUtMTIzNDU2Nzg5MA_-.~';

describe('buildSocialLoginUrl', () => {
  it('웹 origin 프록시의 OAuth 시작 주소에 app_challenge를 붙여야 한다', () => {
    expect(buildSocialLoginUrl('https://contest.example/backend', 'google', 'abc-_123')).toBe(
      'https://contest.example/backend/auth/google?app_challenge=abc-_123',
    );
    expect(buildSocialLoginUrl('https://contest.example/backend', 'kakao', 'x')).toBe(
      'https://contest.example/backend/auth/kakao?app_challenge=x',
    );
  });
});

describe('readAuthCallback', () => {
  it('웹 origin의 https 앱 로그인 콜백에서 code를 읽어야 한다', () => {
    expect(CALLBACK).toBe('https://contest.example/app-auth/callback');
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}`, CALLBACK)).toEqual({ code: CODE });
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}#_=_`, CALLBACK)).toEqual({ code: CODE });
    expect(readAuthCallback(`HTTPS://Contest.Example/app-auth/callback?code=${CODE}`, CALLBACK)).toEqual({
      code: CODE,
    });
  });

  it('서버가 보낸 error를 실패로 읽어야 한다', () => {
    expect(readAuthCallback(`${CALLBACK}?error=login_failed`, CALLBACK)).toEqual({ error: 'login_failed' });
  });

  it('다른 origin·경로·스킴의 주소는 null이어야 한다', () => {
    for (const url of [
      `photocontest://auth/callback?code=${CODE}`,
      `photocontest://app-auth/callback?code=${CODE}`,
      `http://contest.example/app-auth/callback?code=${CODE}`,
      `https://contest.example.evil.example/app-auth/callback?code=${CODE}`,
      `https://contest.example@evil.example/app-auth/callback?code=${CODE}`,
      `https://contest.example:8443/app-auth/callback?code=${CODE}`,
      `https://evil.example/app-auth/callback?code=${CODE}`,
      `https://contest.example/app-auth/callbackx?code=${CODE}`,
      `https://contest.example/app-auth/callback/?code=${CODE}`,
      `https://contest.example/App-Auth/callback?code=${CODE}`,
      `https://contest.example/groups/1?code=${CODE}`,
    ]) {
      expect(readAuthCallback(url, CALLBACK), url).toBeNull();
    }
  });

  it('쿼리는 code 하나나 error 하나만 받고 형식이 틀리면 null이어야 한다', () => {
    for (const url of [
      CALLBACK,
      `${CALLBACK}?`,
      `${CALLBACK}#code=${CODE}`,
      `${CALLBACK}?code=short`,
      `${CALLBACK}?code=${'a'.repeat(257)}`,
      `${CALLBACK}?code=${CODE}%3Cscript%3E`,
      `${CALLBACK}?code=%E0%A4%A`,
      `${CALLBACK}?xcode=${CODE}`,
      `${CALLBACK}?state=x&code=${CODE}`,
      `${CALLBACK}?code=${CODE}&code=${CODE}`,
      `${CALLBACK}?code=${CODE}&error=access_denied`,
      `${CALLBACK}?error=Login-Failed`,
      `${CALLBACK}?error=`,
      `${CALLBACK}?code=${CODE} `,
    ]) {
      expect(readAuthCallback(url, CALLBACK), url).toBeNull();
    }
  });

  it('콜백 주소 자체가 http(s) 주소가 아니면 무엇도 받지 않아야 한다', () => {
    expect(
      readAuthCallback(`photocontest://auth/callback?code=${CODE}`, 'photocontest://auth/callback'),
    ).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}`, 'https://contest.example')).toBeNull();
  });
});
