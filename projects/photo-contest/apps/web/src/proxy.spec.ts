import { NextRequest } from 'next/server';

import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, 'http://localhost:3200'), { headers: cookie ? { cookie } : {} });

describe('proxy', () => {
  it('세션 쿠키 없이 멤버 전용 화면에 오면 원래 경로를 next에 담아 홈으로 보내야 한다', () => {
    const response = proxy(request('/contests/c1?sort=popular'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3200/?next=%2Fcontests%2Fc1%3Fsort%3Dpopular',
    );
  });

  it('세션 쿠키가 있으면 그대로 통과시켜야 한다', () => {
    const response = proxy(request('/groups/g1', 'theme=light; contest_session=abc'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('운영의 __Host- 세션 쿠키로도 멤버 전용 화면을 열어야 한다', () => {
    const response = proxy(request('/me', 'theme=light; __Host-contest_session=abc'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('앱 로그인 콜백과 앱 링크 검증 파일은 로그인 게이트 없이 열려야 한다', () => {
    for (const path of [
      '/app-auth/callback?code=abcdefghijklmnop',
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json',
    ]) {
      const response = proxy(request(path));
      expect(response.headers.get('location'), path).toBeNull();
      expect(response.headers.get('x-middleware-next'), path).toBe('1');
    }
  });

  it('멤버 전용 경로만 검사해야 한다', () => {
    expect(config.matcher).toEqual(['/contests/:path*', '/me']);
  });
});
