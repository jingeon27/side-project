import { describe, expect, it } from 'vitest';
import { decideNavigation, isSameOrigin, toWebPath } from './navigation-policy';
const origin = 'https://feedback.example';
describe('WebView navigation and deep links', () => {
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
    expect(toWebPath(`${origin}/en/messages?conversation=chat-1`, origin)).toBe(
      '/en/messages?conversation=chat-1',
    );
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
