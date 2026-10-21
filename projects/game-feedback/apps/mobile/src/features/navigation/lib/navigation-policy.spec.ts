import { describe, expect, it } from 'vitest';
import { decideNavigation, isSameOrigin, toWebPath } from './navigation-policy';
import { appRoutes, resolveAppRoute, WebPathSchema } from '@game-feedback/bridge';
const origin = 'https://feedback.example';
describe('WebView navigation and deep links', () => {
  it('가입 안내 딥링크와 복귀 경로를 보존하고 인증 화면 간 순환과 외부 목적지를 차단해야 한다', () => {
    const parent = appRoutes.boards('ko', 'friendly', '주말', 'another-game', { battleMode: 'TEAM' });
    const onboarding = appRoutes.onboarding('ko', parent);
    expect(toWebPath(`gamefeedback:/${onboarding}`, origin)).toBe(onboarding);
    expect(decideNavigation(`gamefeedback:/${onboarding}`, origin)).toEqual({
      action: 'navigate',
      path: onboarding,
    });
    expect(resolveAppRoute(onboarding)).toMatchObject({ screen: 'onboarding', parent, tab: 'settings' });
    for (const unsafe of [
      appRoutes.login('ko'),
      appRoutes.onboarding('ko'),
      '/en/terms',
      'https://outside.test',
    ]) {
      expect(toWebPath(`gamefeedback:/${appRoutes.onboarding('ko', unsafe)}`, origin)).toBeNull();
      expect(toWebPath(`gamefeedback:/${appRoutes.login('ko', unsafe)}`, origin)).toBeNull();
    }
  });
  it('opens a dedicated composer within the WebView and preserves its board and game', () => {
    const path = appRoutes.compose('ko', 'FRIEND_SALE', 'another-game');
    expect(toWebPath(`gamefeedback:/${path}`, origin)).toBe(path);
    expect(resolveAppRoute(path)).toMatchObject({
      screen: 'compose',
      parent: '/ko/boards/friend-sale?game=another-game',
    });
    expect(toWebPath('gamefeedback://ko/write?board=unknown', origin)).toBeNull();
  });
  it('shares nested chat paths and preserves only route-owned query state', () => {
    for (const locale of ['ko', 'en', 'ja']) {
      const feed = appRoutes.feed(locale, { q: '호그 덱', tab: 'unanswered' });
      expect(toWebPath(`${origin}${feed}`, origin)).toBe(feed);
      expect(resolveAppRoute(feed)).toMatchObject({ screen: 'feed', tab: 'feed', parent: null });
      const profile = appRoutes.profile(locale, 'user-1', 'opaque+/=');
      expect(toWebPath(`gamefeedback:/${profile}`, origin)).toBe(profile);
      expect(WebPathSchema.parse(`/${locale}/messages?conversation=room-1`)).toBe(
        appRoutes.conversation(locale, 'room-1'),
      );
      expect(resolveAppRoute(appRoutes.conversation(locale, 'room-1'))).toMatchObject({
        screen: 'conversation',
        parent: appRoutes.messages(locale),
      });
    }
    expect(WebPathSchema.parse('/ko?q=hog&utm_source=app')).toBe('/ko?q=hog');
    for (const path of [
      '/ko?x=%XX',
      '/ko?q=a&q=b',
      '/ko/messages?conversation=a&conversation=b',
      '/ko?q=' + 'x'.repeat(101),
      '/ko/users/user-1?cursor=' + 'x'.repeat(201),
    ])
      expect(WebPathSchema.safeParse(path).success).toBe(false);
  });
  it('rejects administrator paths and malformed query data while preserving safe route encoding', () => {
    ['ko', 'en', 'ja'].forEach((locale) => {
      expect(resolveAppRoute(`/${locale}/admin`)).toBeNull();
      expect(toWebPath(`gamefeedback://${locale}/admin`, origin)).toBeNull();
    });
    [
      '/ko?%71=a&q=b',
      '/ko?q=%00',
      '/ko?q=a?x=b',
      '/ko/search?board=free&feedbackStatus=WAITING',
      '/ko/boards/free?battleMode=TEAM',
    ].forEach((path) => {
      expect(WebPathSchema.safeParse(path).success).toBe(false);
    });
    expect(WebPathSchema.parse('/ko/search?q=hog+%26+ice&&utm_source=app')).toBe(
      '/ko/search?q=hog%20%26%20ice',
    );
    expect(WebPathSchema.parse('/ko?__proto__=safe&q=hog')).toBe('/ko?q=hog');
  });
  it('keeps only exact origins in the WebView', () => {
    for (const url of [origin, `${origin}/ko/posts/abc`, 'about:blank'])
      expect(decideNavigation(url, origin).action).toBe('allow');
    for (const url of [
      `${origin}.evil/ko`,
      'https://feedback.example@evil.example/ko',
      'http://feedback.example/ko',
      'https://feedback.example:444/ko',
    ])
      expect(decideNavigation(url, origin).action).toBe('external');
    expect(isSameOrigin('https://feedback.example.evil/', origin)).toBe(false);
  });
  it('accepts known custom-scheme routes and rejects unsafe route IDs', () => {
    expect(toWebPath('gamefeedback://ko/users/player_123', origin)).toBe('/ko/users/player_123');
    expect(toWebPath('gamefeedback://ko/posts/post_123', origin)).toBe('/ko/posts/post_123');
    expect(toWebPath(`${origin}/en/messages?conversation=chat-1`, origin)).toBe('/en/messages/chat-1');
    for (const path of ['../settings', '%2Fetc', '한글', 'x'.repeat(129), 'a b', 'a#b'])
      expect(toWebPath(`gamefeedback://ko/posts/${path}`, origin)).toBeNull();
    for (const url of [
      'gamefeedback://auth/callback?code=x',
      'gamefeedback://ko/unknown',
      'gamefeedback://evil/ko',
      `${origin}.evil/ko`,
    ])
      expect(toWebPath(url, origin)).toBeNull();
  });
  it('blocks executable and local URLs while opening external links outside', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'content://x',
      'intent://x',
      '//evil.example',
      'https://evil.example/\\x',
    ])
      expect(decideNavigation(url, origin).action).toBe('block');
    expect(decideNavigation('mailto:contact@bambyul.com', origin)).toEqual({
      action: 'external',
      url: 'mailto:contact@bambyul.com',
    });
    expect(decideNavigation('https://example.com/help', origin)).toEqual({
      action: 'external',
      url: 'https://example.com/help',
    });
    expect(decideNavigation('gamefeedback://ko/settings', origin)).toEqual({
      action: 'navigate',
      path: '/ko/settings',
    });
  });
});
