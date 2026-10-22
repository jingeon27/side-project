import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appVersions,
  assertProductionConfig,
  developmentLoginEnabled,
  mobileAppScheme,
  trustedProxyHops,
  webOrigin,
} from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('앱 버전 설정', () => {
  it('설정이 없으면 1.0.0, 최신 버전이 없으면 최소 버전을 써야 한다', () => {
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '');
    vi.stubEnv('MOBILE_LATEST_VERSION', '');
    expect(appVersions()).toEqual({ minimumVersion: '1.0.0', latestVersion: '1.0.0' });
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '1.2.3');
    expect(appVersions()).toEqual({ minimumVersion: '1.2.3', latestVersion: '1.2.3' });
    vi.stubEnv('MOBILE_LATEST_VERSION', '1.10.0');
    expect(appVersions()).toEqual({ minimumVersion: '1.2.3', latestVersion: '1.10.0' });
  });

  it('x.y.z 형식이 아니면 기본값으로 바꿔야 한다', () => {
    for (const invalid of ['1.0', '1.0.0.0', 'v1.0.0', '1.0.0-beta', '01.0.0', 'abc', '1..0']) {
      vi.stubEnv('MOBILE_MINIMUM_VERSION', invalid);
      vi.stubEnv('MOBILE_LATEST_VERSION', invalid);
      expect(appVersions()).toEqual({ minimumVersion: '1.0.0', latestVersion: '1.0.0' });
    }
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '2.0.0');
    vi.stubEnv('MOBILE_LATEST_VERSION', 'latest');
    expect(appVersions()).toEqual({ minimumVersion: '2.0.0', latestVersion: '2.0.0' });
  });

  it('최신 버전이 최소 버전보다 낮으면 최소 버전을 최신으로 봐야 한다', () => {
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '2.0.0');
    vi.stubEnv('MOBILE_LATEST_VERSION', '1.9.9');
    expect(appVersions()).toEqual({ minimumVersion: '2.0.0', latestVersion: '2.0.0' });
  });
});

describe('앱 scheme 설정', () => {
  it('설정이 없거나 형식이 틀리거나 웹 scheme이면 photocontest를 써야 한다', () => {
    vi.stubEnv('MOBILE_APP_SCHEME', '');
    expect(mobileAppScheme()).toBe('photocontest');
    for (const invalid of ['Photo', '1app', 'my app', 'app://', 'https', 'javascript']) {
      vi.stubEnv('MOBILE_APP_SCHEME', invalid);
      expect(mobileAppScheme()).toBe('photocontest');
    }
    vi.stubEnv('MOBILE_APP_SCHEME', 'photo-contest.dev+1');
    expect(mobileAppScheme()).toBe('photo-contest.dev+1');
  });
});

describe('실행 환경 설정', () => {
  it('기본값은 전달 헤더를 신뢰하지 않고 명시한 프록시 한 단계만 허용해야 한다', () => {
    vi.stubEnv('TRUST_PROXY_HOPS', undefined);
    expect(trustedProxyHops()).toBe(0);
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    expect(trustedProxyHops()).toBe(1);
    for (const invalid of ['true', '2', '-1', '']) {
      vi.stubEnv('TRUST_PROXY_HOPS', invalid);
      expect(() => trustedProxyHops()).toThrow('TRUST_PROXY_HOPS must be 0 or 1.');
    }
  });

  it('개발 로그인은 NODE_ENV=development와 ENABLE_DEV_LOGIN=true가 모두 있을 때만 열어야 한다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEV_LOGIN', 'true');
    expect(developmentLoginEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(developmentLoginEnabled()).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEV_LOGIN', '1');
    expect(developmentLoginEnabled()).toBe(false);
  });

  it('운영 시작 때 S3 경로·주소와 OAuth 키 짝을 검사해 첫 요청 전에 실패해야 한다', () => {
    const production = {
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://contest.example',
      DATABASE_URL: 'postgresql://contest@db/contest',
      S3_BUCKET: 'contest-media',
      S3_ENDPOINT: '',
      S3_KEY_PREFIX: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      KAKAO_CLIENT_ID: '',
      KAKAO_CLIENT_SECRET: '',
      DEPLOYMENT_TARGET: '',
    };
    const check = (overrides: Record<string, string>) => {
      for (const [name, value] of Object.entries({ ...production, ...overrides })) vi.stubEnv(name, value);
      return () => assertProductionConfig();
    };
    expect(check({})).not.toThrow();
    expect(check({ S3_KEY_PREFIX: 'photo-contest/media' })).not.toThrow();
    expect(check({ S3_KEY_PREFIX: '../escape' })).toThrow(
      'S3_KEY_PREFIX must contain relative path segments.',
    );
    expect(check({ S3_ENDPOINT: 'not a url' })).toThrow('S3_ENDPOINT must be an http(s) URL.');
    expect(check({ S3_ENDPOINT: 'ftp://storage.example' })).toThrow('S3_ENDPOINT must be an http(s) URL.');
    expect(check({ S3_ENDPOINT: 'https://storage.example' })).not.toThrow();
    expect(check({ GOOGLE_CLIENT_ID: 'google-id' })).toThrow(
      'GOOGLE_CLIENT_ID requires GOOGLE_CLIENT_SECRET.',
    );
    expect(check({ GOOGLE_CLIENT_SECRET: 'google-secret' })).toThrow(
      'GOOGLE_CLIENT_SECRET is set without GOOGLE_CLIENT_ID.',
    );
    expect(check({ GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret' })).not.toThrow();
    // 카카오 client secret은 콘솔에서 켤 때만 쓰므로 아이디만 있어도 된다.
    expect(check({ KAKAO_CLIENT_ID: 'kakao-id' })).not.toThrow();
    expect(check({ KAKAO_CLIENT_SECRET: 'kakao-secret' })).toThrow(
      'KAKAO_CLIENT_SECRET is set without KAKAO_CLIENT_ID.',
    );
    // 개발·테스트는 검사하지 않는다.
    expect(check({ NODE_ENV: 'development', S3_KEY_PREFIX: '../escape' })).not.toThrow();
  });

  it('WEB_ORIGIN은 경로를 뺀 origin으로 비교해야 한다', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://contest.example/app/');
    expect(webOrigin()).toBe('https://contest.example');
  });
});
