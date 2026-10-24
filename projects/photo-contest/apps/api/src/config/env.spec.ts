import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appVersions,
  assertProductionConfig,
  developmentLoginEnabled,
  mobileAuthCallbackUrl,
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

describe('앱 로그인 콜백 설정', () => {
  it('설정이 없으면 WEB_ORIGIN의 /app-auth/callback을 써야 한다', () => {
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3200');
    vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', '');
    expect(mobileAuthCallbackUrl()).toBe('http://localhost:3200/app-auth/callback');
  });

  it('WEB_ORIGIN의 콜백 경로와 정확히 같을 때만 설정을 따르고 아니면 기본값을 써야 한다', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://contest.example');
    vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', 'https://CONTEST.example:443/app-auth/callback');
    expect(mobileAuthCallbackUrl()).toBe('https://contest.example/app-auth/callback');
    for (const invalid of [
      'photocontest://auth/callback',
      'http://contest.example/app-auth/callback',
      'https://contest.example.evil.example/app-auth/callback',
      'https://contest.example/app-auth/callback/',
      'https://contest.example/App-Auth/callback',
      'https://contest.example/app-auth/callback?next=/',
      'https://contest.example/app-auth/callback#x',
      'https://user@contest.example/app-auth/callback',
      'not a url',
    ]) {
      vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', invalid);
      expect(mobileAuthCallbackUrl(), invalid).toBe('https://contest.example/app-auth/callback');
    }
  });
});

describe('운영 설정 검증', () => {
  function stubProductionEnv() {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEPLOYMENT_TARGET', '');
    vi.stubEnv('WEB_ORIGIN', 'https://contest.example');
    vi.stubEnv('DATABASE_URL', 'postgresql://contest@db.example/contest');
    vi.stubEnv('S3_BUCKET', 'contest-media');
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_KEY_PREFIX', '');
    for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET'])
      vi.stubEnv(name, '');
  }

  it('앱 로그인 콜백이 WEB_ORIGIN과 같은 origin의 https 콜백이면 시작을 허용해야 한다', () => {
    stubProductionEnv();
    vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', 'https://contest.example/app-auth/callback');
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it('앱 로그인 콜백이 없거나 다른 origin·커스텀 스킴이면 시작을 멈춰야 한다', () => {
    stubProductionEnv();
    for (const invalid of [
      '',
      'photocontest://auth/callback',
      'https://other.example/app-auth/callback',
      'http://contest.example/app-auth/callback',
      'https://contest.example/other',
    ]) {
      vi.stubEnv('MOBILE_AUTH_CALLBACK_URL', invalid);
      expect(() => assertProductionConfig(), invalid).toThrow(
        'Production requires MOBILE_AUTH_CALLBACK_URL=https://contest.example/app-auth/callback',
      );
    }
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
      MOBILE_AUTH_CALLBACK_URL: 'https://contest.example/app-auth/callback',
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
