import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  OAUTH_RETURN_COOKIE,
  requestedReturnPath,
  savedReturnPath,
  loginRedirect,
} from './oauth-return-path';

describe('OAuth 로그인 복귀 경로', () => {
  it('외부 주소와 지원하지 않는 경로를 거부하고 기존 요청의 기본 목적지는 보존해야 한다', () => {
    expect(requestedReturnPath({ query: {} } as Request)).toBe('/ko');
    ['https://outside.test', '//outside.test', '/api/auth/logout', '/ko/../login'].forEach((returnTo) => {
      expect(() => requestedReturnPath({ query: { returnTo } } as unknown as Request)).toThrow();
    });
  });
  it('복귀 쿠키는 서비스의 언어 경로만 복원하고 잘못된 값은 홈으로 대체해야 한다', () => {
    const path = '/ja/login?returnTo=' + encodeURIComponent('/ja/boards/coaching?coachingRole=STUDENT');
    const request = (value: string) =>
      ({
        headers: { cookie: `${OAUTH_RETURN_COOKIE}=${Buffer.from(value).toString('base64url')}` },
      }) as Request;
    expect(savedReturnPath(request(path))).toBe(path);
    expect(savedReturnPath(request('https://outside.test'))).toBe('/ko');
    expect(savedReturnPath(request('/ko/../login'))).toBe('/ko');
  });
  it('가입과 취소 상태를 추가할 때 언어와 복귀할 게시판 필터를 유지해야 한다', () => {
    const path = '/en/login?returnTo=' + encodeURIComponent('/en/boards/coaching?coachingRole=STUDENT');
    const cancelled = new URL(loginRedirect('https://feedback.test', path, 'cancelled'));
    expect(cancelled.pathname).toBe('/en/login');
    expect(cancelled.searchParams.get('returnTo')).toBe('/en/boards/coaching?coachingRole=STUDENT');
    expect(cancelled.searchParams.get('login')).toBe('cancelled');
    expect(
      new URL(loginRedirect('https://feedback.test', path, 'onboarding')).searchParams.get('onboard'),
    ).toBe('1');
  });
});
