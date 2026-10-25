import { describe, expect, it } from 'vitest';

import {
  buildLoginRedirectPath,
  decideAuthGate,
  getSafeNextPath,
  hasSessionCookie,
  isSessionRequiredPath,
  readCookie,
} from './auth-gate.helper';

describe('readCookie', () => {
  it('Cookie 헤더 원문에서 이름이 정확히 같은 쿠키만 읽어야 한다', () => {
    const header = 'theme=light; xcontest_session=nope;contest_session=abc123 ; other=1';
    expect(readCookie(header, 'contest_session')).toBe('abc123');
    expect(readCookie(header, 'missing')).toBeNull();
  });

  it('같은 이름이 여러 번 오면 첫 값을 써야 한다', () => {
    expect(readCookie('contest_session=first; contest_session=second', 'contest_session')).toBe('first');
  });

  it('퍼센트 인코딩과 따옴표를 풀어야 한다', () => {
    expect(readCookie('a=%ED%95%9C%EA%B8%80', 'a')).toBe('한글');
    expect(readCookie('a="quoted"', 'a')).toBe('quoted');
  });

  it('깨진 인코딩·8KB를 넘는 헤더·빈 헤더는 없는 것으로 봐야 한다', () => {
    expect(readCookie('contest_session=%E0%A4%A', 'contest_session')).toBeNull();
    expect(readCookie(`pad=${'x'.repeat(8200)}; contest_session=abc`, 'contest_session')).toBeNull();
    expect(readCookie(null, 'contest_session')).toBeNull();
    expect(readCookie('', 'contest_session')).toBeNull();
  });
});

describe('hasSessionCookie', () => {
  it('값이 있는 세션 쿠키가 있을 때만 true여야 한다', () => {
    expect(hasSessionCookie('contest_session=abc')).toBe(true);
    expect(hasSessionCookie('__Host-contest_session=abc')).toBe(true);
    expect(hasSessionCookie('contest_session=')).toBe(false);
    expect(hasSessionCookie('contest_oauth_state=abc')).toBe(false);
    expect(hasSessionCookie('__Host-contest_oauth_state=abc')).toBe(false);
    expect(hasSessionCookie(undefined)).toBe(false);
  });

  it('다른 쿠키가 많아 4KB를 넘어도 세션 쿠키를 찾아야 한다', () => {
    // API보다 낮은 4KB 상한 때문에 로그인 사용자가 멤버 전용 화면에서 로그인 화면으로 밀려났다.
    const crowded = `${Array.from({ length: 60 }, (_, index) => `analytics_${index}=${'v'.repeat(80)}`).join('; ')}; __Host-contest_session=abc`;
    expect(crowded.length).toBeGreaterThan(4096);
    expect(crowded.length).toBeLessThanOrEqual(8 * 1024);
    expect(hasSessionCookie(crowded)).toBe(true);
  });
});

describe('isSessionRequiredPath', () => {
  it('콘텐츠 화면에는 세션이 필요하고 인증·정책·정적 경로는 제외해야 한다', () => {
    expect(isSessionRequiredPath('/groups/g1')).toBe(true);
    expect(isSessionRequiredPath('/explore')).toBe(true);
    expect(isSessionRequiredPath('/contests/c1')).toBe(true);
    expect(isSessionRequiredPath('/me')).toBe(true);
    expect(isSessionRequiredPath('/notifications')).toBe(true);
    expect(isSessionRequiredPath('/')).toBe(true);
    expect(isSessionRequiredPath('/invite/token')).toBe(true);
    expect(isSessionRequiredPath('/groupsX')).toBe(false);
    expect(isSessionRequiredPath('/member')).toBe(false);
  });
});

describe('decideAuthGate', () => {
  it('세션 쿠키 없이 멤버 전용 화면에 오면 원래 경로와 쿼리를 next에 담아 인증 화면으로 보내야 한다', () => {
    expect(decideAuthGate({ pathname: '/contests/c1', search: '?sort=popular', cookieHeader: null })).toEqual(
      {
        type: 'redirect',
        location: '/sign?next=%2Fcontests%2Fc1%3Fsort%3Dpopular',
      },
    );
  });

  it('세션 쿠키가 있거나 공개 화면이면 통과시켜야 한다', () => {
    expect(decideAuthGate({ pathname: '/sign', search: '', cookieHeader: null })).toEqual({
      type: 'allow',
    });
    expect(
      decideAuthGate({ pathname: '/groups/g1', search: '', cookieHeader: 'contest_session=abc' }),
    ).toEqual({ type: 'allow' });
    expect(decideAuthGate({ pathname: '/privacy', search: '', cookieHeader: null })).toEqual({
      type: 'allow',
    });
  });
});

describe('getSafeNextPath', () => {
  it('같은 origin의 상대 경로만 그대로 돌려줘야 한다', () => {
    expect(getSafeNextPath('/contests/c1?sort=popular')).toBe('/contests/c1?sort=popular');
    expect(buildLoginRedirectPath('/me')).toBe('/sign?next=%2Fme');
  });

  it('다른 origin으로 새거나 형식이 이상한 값은 홈으로 바꿔야 한다', () => {
    for (const value of [
      null,
      '',
      '/sign?next=%2Fme',
      '/login',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'groups/1',
      '/groups/1\nSet-Cookie: x',
      `/${'a'.repeat(2048)}`,
    ])
      expect(getSafeNextPath(value)).toBe('/');
  });
});
