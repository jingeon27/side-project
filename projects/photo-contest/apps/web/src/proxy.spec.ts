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

  it('멤버 전용 경로만 검사해야 한다', () => {
    expect(config.matcher).toEqual(['/groups/:path*', '/contests/:path*', '/me']);
  });
});
