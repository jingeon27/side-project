import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { AuthReturnPathSchema } from '@game-feedback/contracts';

import {
  loginRedirect,
  OAUTH_RETURN_COOKIE,
  requestedReturnPath,
  savedReturnPath,
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
    const onboarding = new URL(loginRedirect('https://feedback.test', path, 'onboarding'));
    expect(onboarding.pathname).toBe('/en/onboarding');
    expect(onboarding.searchParams.get('returnTo')).toBe('/en/boards/coaching?coachingRole=STUDENT');
    const existing = new URL(loginRedirect('https://feedback.test', path));
    expect(existing.pathname).toBe('/en/boards/coaching');
    expect(existing.searchParams.get('coachingRole')).toBe('STUDENT');
  });

  it.each(['ko', 'en', 'ja'])(
    '신규 %s 사용자는 복귀할 홈을 가진 별도 가입 화면으로 보내야 한다',
    (locale) => {
      const destination = new URL(loginRedirect('https://feedback.test', `/${locale}`, 'onboarding'));
      expect(destination.pathname).toBe(`/${locale}/onboarding`);
      expect(destination.searchParams.get('returnTo')).toBe(`/${locale}`);
      expect(destination.searchParams.has('onboard')).toBe(false);
    },
  );

  it.each([
    '/ko/../en/settings',
    '/ko/%2e%2e/en/settings',
    '/ko/login?returnTo=https%3A%2F%2Foutside.test',
    '/ko/login?returnTo=%2F%2Foutside.test',
    '/ko/login?returnTo=%2Fen%2Fsettings',
    '/ko/login?returnTo=%2Fko%2Flogin',
    '/ko/login?returnTo=%2Fko%2Fonboarding',
    '/ko/onboarding?returnTo=%2Fko%2Flogin%3FreturnTo%3D%252Fko',
    '/ko/login?returnTo=%2Fko&returnTo=%2Fko%2Fsettings',
    '/ko/login/again',
  ])('안전하지 않은 중첩 복귀 경로 %s를 거부해야 한다', (returnTo) => {
    expect(AuthReturnPathSchema.safeParse(returnTo).success).toBe(false);
    expect(() => requestedReturnPath({ query: { returnTo } } as unknown as Request)).toThrow();
  });
});
