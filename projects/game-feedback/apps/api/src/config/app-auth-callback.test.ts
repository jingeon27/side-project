import { describe, expect, it } from 'vitest';

import { resolveAppAuthCallbackUrl } from './app-auth-callback';

const ORIGIN = 'https://play.game-feedback.test';
const CALLBACK = `${ORIGIN}/app-auth/callback`;

// 감사 M3: 커스텀 스킴 콜백은 같은 스킴을 등록한 다른 앱이 자기 challenge로 시작한 흐름의 코드를 받을 수 있었다.
describe('app login callback target', () => {
  it('uses only the HTTPS app link path on WEB_ORIGIN, ignoring custom schemes and other targets', () => {
    expect(resolveAppAuthCallbackUrl(undefined, ORIGIN, false)).toBe(CALLBACK);
    expect(resolveAppAuthCallbackUrl(`${CALLBACK}?`, ORIGIN, false)).toBe(CALLBACK);
    for (const configured of [
      'gamefeedback://auth/callback',
      'https://evil.example/app-auth/callback',
      `${ORIGIN}.evil.example/app-auth/callback`,
      `${ORIGIN}/app-auth/callback/extra`,
      `${ORIGIN}/app-auth/callback?next=https://evil.example`,
      `${ORIGIN}/app-auth/callback#code`,
      `https://user@play.game-feedback.test/app-auth/callback`,
      'javascript:alert(1)',
      'not a url',
    ])
      expect(resolveAppAuthCallbackUrl(configured, ORIGIN, false), configured).toBe(CALLBACK);
  });

  it('derives the production callback and rejects an explicitly unsafe target', () => {
    expect(resolveAppAuthCallbackUrl(CALLBACK, ORIGIN, true)).toBe(CALLBACK);
    expect(resolveAppAuthCallbackUrl(undefined, ORIGIN, true)).toBe(CALLBACK);
    for (const configured of ['', 'gamefeedback://auth/callback', 'https://other.test/app-auth/callback'])
      expect(() => resolveAppAuthCallbackUrl(configured, ORIGIN, true), String(configured)).toThrow(
        `App login callback must be ${CALLBACK}`,
      );
  });
});
