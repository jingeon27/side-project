import { describe, expect, it } from 'vitest';

import { buildAuthCallbackUrl, buildSocialLoginUrl, readAuthCallback } from './social-login';

const CALLBACK = buildAuthCallbackUrl('photocontest');
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
  it('콜백 주소의 code를 읽어야 한다', () => {
    expect(CALLBACK).toBe('photocontest://auth/callback');
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}`, CALLBACK)).toEqual({ code: CODE });
    expect(readAuthCallback(`${CALLBACK}?state=x&code=${encodeURIComponent(CODE)}#_=_`, CALLBACK)).toEqual({
      code: CODE,
    });
    expect(readAuthCallback(`PhotoContest://auth/callback?code=${CODE}`, CALLBACK)).toEqual({ code: CODE });
  });

  it('error가 있으면 code보다 먼저 실패로 읽어야 한다', () => {
    expect(readAuthCallback(`${CALLBACK}?error=login_failed`, CALLBACK)).toEqual({ error: 'login_failed' });
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}&error=access_denied`, CALLBACK)).toEqual({
      error: 'access_denied',
    });
  });

  it('콜백 주소가 아니거나 code 형식이 틀리면 null이어야 한다', () => {
    expect(readAuthCallback(`photocontest://auth/callbackx?code=${CODE}`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`photocontest://groups/1?code=${CODE}`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`https://evil.example/auth/callback?code=${CODE}`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}#code=${CODE}`, CALLBACK)).toBeNull();
    expect(readAuthCallback(CALLBACK, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?code=short`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?code=${'a'.repeat(257)}`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?code=${CODE}%3Cscript%3E`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?code=%E0%A4%A`, CALLBACK)).toBeNull();
    expect(readAuthCallback(`${CALLBACK}?xcode=${CODE}`, CALLBACK)).toBeNull();
  });
});
