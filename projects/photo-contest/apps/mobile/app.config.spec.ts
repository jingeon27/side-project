import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig, { readBuildSettings } from './app.config';
import { AUTH_CALLBACK_PATH } from './src/shared/config/app-links';

const RELEASE_ENV = {
  EXPO_PUBLIC_WEB_ORIGIN: 'https://contest.example',
  MOBILE_APPLE_TEAM_ID: 'ABCDE12345',
  MOBILE_IOS_BUNDLE_ID: 'com.example.contest',
  MOBILE_ANDROID_PACKAGE: 'com.example.contest',
};

function buildConfig(env: Record<string, string>) {
  for (const name of ['APP_VARIANT', ...Object.keys(RELEASE_ENV)]) vi.stubEnv(name, env[name] ?? '');
  return appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('운영 빌드 설정', () => {
  it('앱 로그인 콜백 경로만 검증된 https 앱 링크로 받고 최소 iOS를 17.4로 둬야 한다', () => {
    const config = buildConfig(RELEASE_ENV);

    expect(config.ios).toMatchObject({
      bundleIdentifier: 'com.example.contest',
      appleTeamId: 'ABCDE12345',
      deploymentTarget: '17.4',
      associatedDomains: ['applinks:contest.example', 'webcredentials:contest.example'],
    });
    expect(config.android?.package).toBe('com.example.contest');
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'contest.example', path: AUTH_CALLBACK_PATH }],
      },
    ]);
    expect(AUTH_CALLBACK_PATH).toBe('/app-auth/callback');
    expect(config.extra).toEqual({ webOrigin: 'https://contest.example' });
    expect(JSON.stringify(config.plugins)).not.toContain('usesCleartextTraffic');
    expect(config.ios?.infoPlist).not.toHaveProperty('NSAppTransportSecurity');
    expect(config.android?.allowBackup).toBe(false);
  });

  it('앱 링크 값이 하나라도 없거나 웹 origin에 포트가 있으면 이름을 담아 멈춰야 한다', () => {
    const cases: [Record<string, string>, RegExp][] = [
      [
        { EXPO_PUBLIC_WEB_ORIGIN: 'https://contest.example' },
        /MOBILE_IOS_BUNDLE_ID.*MOBILE_ANDROID_PACKAGE.*MOBILE_APPLE_TEAM_ID/,
      ],
      [{ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'https://contest.example:8443' }, /EXPO_PUBLIC_WEB_ORIGIN/],
      [{ ...RELEASE_ENV, MOBILE_APPLE_TEAM_ID: '' }, /MOBILE_APPLE_TEAM_ID/],
      [{ ...RELEASE_ENV, MOBILE_APPLE_TEAM_ID: 'abcde12345' }, /MOBILE_APPLE_TEAM_ID/],
      [{ ...RELEASE_ENV, MOBILE_IOS_BUNDLE_ID: 'contest' }, /MOBILE_IOS_BUNDLE_ID/],
      [{ ...RELEASE_ENV, MOBILE_ANDROID_PACKAGE: 'com.example-contest' }, /MOBILE_ANDROID_PACKAGE/],
    ];
    for (const [env, message] of cases) {
      expect(() => buildConfig(env), JSON.stringify(env)).toThrow(message);
      expect(() => buildConfig(env)).toThrow(/운영 빌드 설정/);
    }
    // https가 아니거나 비어 있으면 앱 링크 값보다 먼저 웹 origin 오류로 멈춘다(app.config.test.ts).
    expect(() => buildConfig({ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'http://contest.example' })).toThrow(
      'EXPO_PUBLIC_WEB_ORIGIN',
    );
  });

  it('웹 origin 뒤의 경로는 버리고 host만 앱 링크에 써야 한다', () => {
    const config = buildConfig({ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'https://Contest.Example/app' });
    expect(config.extra).toEqual({ webOrigin: 'https://contest.example' });
    expect(config.ios?.associatedDomains).toEqual([
      'applinks:contest.example',
      'webcredentials:contest.example',
    ]);
  });
});

describe('개발 빌드 설정', () => {
  it('값이 없으면 개발 식별자와 localhost로 만들고 http 웹에는 앱 링크를 두지 않아야 한다', () => {
    const config = buildConfig({ APP_VARIANT: 'development' });

    expect(config.ios?.bundleIdentifier).toBe('dev.side.photocontest');
    expect(config.ios?.appleTeamId).toBeUndefined();
    expect(config.ios?.deploymentTarget).toBe('17.4');
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.android?.package).toBe('dev.side.photocontest');
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.extra).toEqual({ webOrigin: 'http://localhost:3200' });
    expect(JSON.stringify(config.plugins)).toContain('usesCleartextTraffic');
  });

  it('https 터널 origin이면 개발자 모드 associated domains와 App Link를 둬야 한다', () => {
    const config = buildConfig({ APP_VARIANT: 'development', EXPO_PUBLIC_WEB_ORIGIN: 'https://Dev.Example' });

    expect(config.ios?.associatedDomains).toEqual([
      'applinks:dev.example?mode=developer',
      'webcredentials:dev.example?mode=developer',
    ]);
    expect(config.android?.intentFilters?.[0]?.data).toEqual([
      { scheme: 'https', host: 'dev.example', path: '/app-auth/callback' },
    ]);
  });

  it('직접 넣은 값의 형식이 틀리면 개발 빌드도 멈춰야 한다', () => {
    expect(() => readBuildSettings({ APP_VARIANT: 'development', MOBILE_APPLE_TEAM_ID: 'short' })).toThrow(
      /개발 빌드 설정.*MOBILE_APPLE_TEAM_ID/,
    );
  });
});
