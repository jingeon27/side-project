import { describe, expect, it } from 'vitest';

import { resolveWebOrigin } from './web-origin';

describe('resolveWebOrigin', () => {
  it('개발 번들은 값이 없으면 localhost를, http origin도 그대로 써야 한다', () => {
    expect(resolveWebOrigin(undefined, true)).toBe('http://localhost:3200');
    expect(resolveWebOrigin(' ', true)).toBe('http://localhost:3200');
    expect(resolveWebOrigin('http://192.168.0.10:3200', true)).toBe('http://192.168.0.10:3200');
  });

  it('운영 번들은 값이 없거나 https가 아니면 시작하지 않아야 한다', () => {
    expect(() => resolveWebOrigin(undefined, false)).toThrow('EXPO_PUBLIC_WEB_ORIGIN');
    expect(() => resolveWebOrigin('http://contest.example', false)).toThrow('https');
    expect(() => resolveWebOrigin('contest.example', false)).toThrow('origin');
  });

  it('운영 번들의 https 값은 origin만 남겨야 한다', () => {
    expect(resolveWebOrigin('https://Contest.Example/', false)).toBe('https://contest.example');
  });
});
