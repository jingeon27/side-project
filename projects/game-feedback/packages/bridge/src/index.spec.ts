import { describe, expect, it } from 'vitest';

import { APP_AUTH_CALLBACK_PATH, buildAppAuthCallbackUrl, parseWebMessage, WebPathSchema } from './index';

describe('app login callback', () => {
  it('rejects X login messages while accepting the supported providers', () => {
    expect(
      parseWebMessage(JSON.stringify({ type: 'auth-request', id: 'removed-provider', provider: 'x' })),
    ).toBeNull();
    for (const provider of ['google', 'kakao', 'discord']) {
      expect(
        parseWebMessage(JSON.stringify({ type: 'auth-request', id: 'supported-provider', provider })),
      ).toMatchObject({ type: 'auth-request', provider });
    }
  });

  it('웹 origin의 고정 https 경로를 앱 로그인 콜백으로 써야 한다', () => {
    expect(APP_AUTH_CALLBACK_PATH).toBe('/app-auth/callback');
    expect(buildAppAuthCallbackUrl('https://game.example')).toBe('https://game.example/app-auth/callback');
  });

  it('콜백 경로는 앱이 여는 웹 화면 경로가 아니어야 한다', () => {
    for (const path of ['/app-auth/callback', '/app-auth/callback?code=abc', '/ko/app-auth/callback'])
      expect(WebPathSchema.safeParse(path).success, path).toBe(false);
  });
});
