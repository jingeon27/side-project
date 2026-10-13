import { describe, expect, it } from 'vitest';

import { isRelativeWebPath, toWebPath } from './deep-link';

const OPTIONS = { webOrigin: 'https://contest.example', appScheme: 'photocontest' };

describe('toWebPath', () => {
  it('앱 스킴 링크를 웹 경로로 바꿔야 한다', () => {
    expect(toWebPath('photocontest://invite/AbC_12-x', OPTIONS)).toBe('/invite/AbC_12-x');
    expect(toWebPath('photocontest://groups/cm1group0001', OPTIONS)).toBe('/groups/cm1group0001');
    expect(toWebPath('photocontest://contests/42', OPTIONS)).toBe('/contests/42');
  });

  it('스킴 대소문자, 빈 호스트, 끝 슬래시, 쿼리와 해시를 정리해야 한다', () => {
    expect(toWebPath('PhotoContest://groups/1', OPTIONS)).toBe('/groups/1');
    expect(toWebPath('photocontest:///groups/1', OPTIONS)).toBe('/groups/1');
    expect(toWebPath('photocontest://groups/1/', OPTIONS)).toBe('/groups/1');
    expect(toWebPath('photocontest://contests/7?utm_source=kakao#top', OPTIONS)).toBe('/contests/7');
  });

  it('웹 origin의 같은 경로(유니버설 링크)도 웹 경로로 바꿔야 한다', () => {
    expect(toWebPath('https://contest.example/invite/token_1', OPTIONS)).toBe('/invite/token_1');
    expect(toWebPath('https://CONTEST.example/groups/9?ref=share', OPTIONS)).toBe('/groups/9');
    expect(toWebPath('https://contest.example/', OPTIONS)).toBe('/');
    expect(toWebPath('https://contest.example', OPTIONS)).toBe('/');
  });

  it('소셜 로그인 콜백은 세션이 직접 받으므로 무시해야 한다', () => {
    expect(toWebPath('photocontest://auth/callback?code=abc', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://auth/callback?error=login_failed', OPTIONS)).toBeNull();
  });

  it('모르는 경로와 경로가 없는 링크는 무시해야 한다', () => {
    expect(toWebPath('photocontest://', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://me', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://groups', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://Groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://groups/1/contests', OPTIONS)).toBeNull();
    expect(toWebPath('https://contest.example/me', OPTIONS)).toBeNull();
  });

  it('경로 조작과 위험한 문자를 거부해야 한다', () => {
    expect(toWebPath('photocontest://groups/..', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://groups/../me', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://groups//evil.example', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://invite/%2F%2Fevil.example', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://invite/a b', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://invite/<script>', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest://invite/토큰', OPTIONS)).toBeNull();
    expect(toWebPath(`photocontest://invite/${'a'.repeat(129)}`, OPTIONS)).toBeNull();
    expect(toWebPath(`photocontest://invite/a?${'x'.repeat(2100)}`, OPTIONS)).toBeNull();
  });

  it('다른 origin이나 스킴을 웹 경로로 바꾸지 않아야 한다', () => {
    expect(toWebPath('https://evil.example/groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('https://contest.example.evil.example/groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('https://contest.example@evil.example/groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('http://contest.example/groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('otherapp://groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('photocontest:groups/1', OPTIONS)).toBeNull();
    expect(toWebPath('javascript:alert(1)//photocontest://groups/1', OPTIONS)).toBeNull();
  });
});

describe('isRelativeWebPath', () => {
  it('같은 origin 상대 경로만 받아야 한다', () => {
    expect(isRelativeWebPath('/')).toBe(true);
    expect(isRelativeWebPath('/groups/1?tab=ranking#top')).toBe(true);
    expect(isRelativeWebPath('//evil.example/x')).toBe(false);
    expect(isRelativeWebPath('/\\evil.example')).toBe(false);
    expect(isRelativeWebPath('https://evil.example')).toBe(false);
    expect(isRelativeWebPath('groups/1')).toBe(false);
    expect(isRelativeWebPath('/a b')).toBe(false);
    expect(isRelativeWebPath(`/${'a'.repeat(2048)}`)).toBe(false);
  });
});
