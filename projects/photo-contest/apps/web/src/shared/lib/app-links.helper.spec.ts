import { describe, expect, it } from 'vitest';

import {
  APP_AUTH_CALLBACK_PATH,
  appLinksResponse,
  assertAppLinksConfig,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  readAppLinksConfig,
} from './app-links.helper';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':');
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  MOBILE_APPLE_TEAM_ID: 'ABCDE12345',
  MOBILE_IOS_BUNDLE_ID: 'com.example.contest',
  MOBILE_ANDROID_PACKAGE: 'com.example.contest',
  MOBILE_ANDROID_SHA256_FINGERPRINTS: ` ${FINGERPRINT} , ${FINGERPRINT.toUpperCase()},${'AB:'.repeat(31)}AB`,
};

describe('readAppLinksConfig', () => {
  it('운영 설정으로 iOS app ID와 대문자로 맞춘 중복 없는 Android 지문을 만들어야 한다', () => {
    expect(readAppLinksConfig(PRODUCTION_ENV)).toEqual({
      ok: true,
      config: {
        iosAppId: 'ABCDE12345.com.example.contest',
        androidPackage: 'com.example.contest',
        androidFingerprints: [FINGERPRINT.toUpperCase(), `${'AB:'.repeat(31)}AB`],
      },
    });
  });

  it('운영에서 값이 없으면 자리표시자 대신 빠진 이름을 알려야 한다', () => {
    expect(readAppLinksConfig({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      invalid: [
        'MOBILE_APPLE_TEAM_ID',
        'MOBILE_IOS_BUNDLE_ID',
        'MOBILE_ANDROID_PACKAGE',
        'MOBILE_ANDROID_SHA256_FINGERPRINTS',
      ],
    });
  });

  it('형식이 틀린 값은 어느 환경이든 거부해야 한다', () => {
    const cases: Array<[string, string]> = [
      ['MOBILE_APPLE_TEAM_ID', 'abcde12345'],
      ['MOBILE_APPLE_TEAM_ID', 'ABCDE1234'],
      ['MOBILE_IOS_BUNDLE_ID', 'contest'],
      ['MOBILE_IOS_BUNDLE_ID', 'com.example/contest'],
      ['MOBILE_ANDROID_PACKAGE', 'com.example.1contest'],
      ['MOBILE_ANDROID_PACKAGE', 'com.example-contest.app'],
      ['MOBILE_ANDROID_SHA256_FINGERPRINTS', FINGERPRINT.replaceAll(':', '')],
      ['MOBILE_ANDROID_SHA256_FINGERPRINTS', `${FINGERPRINT}:00`],
      ['MOBILE_ANDROID_SHA256_FINGERPRINTS', ','],
    ];
    for (const nodeEnv of ['production', 'development']) {
      for (const [name, value] of cases) {
        expect(readAppLinksConfig({ ...PRODUCTION_ENV, NODE_ENV: nodeEnv, [name]: value }), value).toEqual({
          ok: false,
          invalid: [name],
        });
      }
    }
  });

  it('개발·테스트는 빈 값을 명백한 자리표시자로 채워야 한다', () => {
    expect(readAppLinksConfig({ NODE_ENV: 'development', MOBILE_APPLE_TEAM_ID: ' ' })).toEqual({
      ok: true,
      config: {
        iosAppId: 'TEAMID0000.dev.side.photocontest',
        androidPackage: 'dev.side.photocontest',
        androidFingerprints: [Array.from({ length: 32 }, () => '00').join(':')],
      },
    });
  });
});

describe('assertAppLinksConfig', () => {
  it('운영 값이 빠지면 이름을 담아 시작을 멈추고, 모두 있으면 통과해야 한다', () => {
    expect(() => assertAppLinksConfig({ ...PRODUCTION_ENV, MOBILE_IOS_BUNDLE_ID: '' })).toThrow(
      /MOBILE_IOS_BUNDLE_ID/,
    );
    expect(() => assertAppLinksConfig(PRODUCTION_ENV)).not.toThrow();
    expect(() => assertAppLinksConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('검증 파일', () => {
  const config = {
    iosAppId: 'ABCDE12345.com.example.contest',
    androidPackage: 'pkg.app',
    androidFingerprints: ['F'],
  };

  it('AASA는 앱 로그인 콜백 경로만 Universal Link로 열고 webcredentials에 같은 앱을 둬야 한다', () => {
    expect(APP_AUTH_CALLBACK_PATH).toBe('/app-auth/callback');
    expect(buildAppleAppSiteAssociation(config)).toEqual({
      applinks: {
        details: [
          { appIDs: ['ABCDE12345.com.example.contest'], components: [{ '/': '/app-auth/callback' }] },
        ],
      },
      webcredentials: { apps: ['ABCDE12345.com.example.contest'] },
    });
  });

  it('assetlinks는 handle_all_urls 권한으로 패키지와 서명 지문을 연결해야 한다', () => {
    expect(buildAssetLinks(config)).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'pkg.app', sha256_cert_fingerprints: ['F'] },
      },
    ]);
  });

  it('설정이 맞으면 JSON으로, 틀리면 내용 없는 404로 답해야 한다', async () => {
    const ok = appLinksResponse(PRODUCTION_ENV, buildAssetLinks);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/json');
    expect(ok.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await ok.json()).toEqual(
      buildAssetLinks({
        ...config,
        androidPackage: 'com.example.contest',
        androidFingerprints: [FINGERPRINT.toUpperCase(), `${'AB:'.repeat(31)}AB`],
      }),
    );

    const missing = appLinksResponse({ NODE_ENV: 'production' }, buildAssetLinks);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(await missing.text()).toBe('');
  });
});
