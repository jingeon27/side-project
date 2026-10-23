import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_AUTH_CALLBACK_PATH } from '@game-feedback/bridge';

import appConfig, { readBuildSettings } from './app.config';

const RELEASE_ENV = {
  EXPO_PUBLIC_WEB_ORIGIN: 'https://game.example',
  MOBILE_APPLE_TEAM_ID: 'ABCDE12345',
  MOBILE_IOS_BUNDLE_ID: 'com.example.game',
  MOBILE_ANDROID_PACKAGE: 'com.example.game',
};

function buildConfig(env: Record<string, string>) {
  for (const name of ['APP_VARIANT', ...Object.keys(RELEASE_ENV)]) vi.stubEnv(name, env[name] ?? '');
  return appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('release build settings', () => {
  it('receives only the app login callback through a verified HTTPS app link and targets iOS 17.4', () => {
    const config = buildConfig(RELEASE_ENV);

    expect(config.ios).toMatchObject({
      bundleIdentifier: 'com.example.game',
      appleTeamId: 'ABCDE12345',
      deploymentTarget: '17.4',
      associatedDomains: ['applinks:game.example', 'webcredentials:game.example'],
      infoPlist: { NSAppTransportSecurity: {} },
    });
    expect(config.android?.package).toBe('com.example.game');
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'game.example', path: APP_AUTH_CALLBACK_PATH }],
      },
    ]);
    expect(JSON.stringify(config.plugins)).not.toContain('usesCleartextTraffic');
  });

  it.each<[Record<string, string>, RegExp]>([
    [{}, /EXPO_PUBLIC_WEB_ORIGIN.*MOBILE_IOS_BUNDLE_ID.*MOBILE_ANDROID_PACKAGE.*MOBILE_APPLE_TEAM_ID/],
    [{ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'http://game.example' }, /EXPO_PUBLIC_WEB_ORIGIN/],
    [{ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'https://game.example:8443' }, /EXPO_PUBLIC_WEB_ORIGIN/],
    [{ ...RELEASE_ENV, EXPO_PUBLIC_WEB_ORIGIN: 'https://game.example/app' }, /EXPO_PUBLIC_WEB_ORIGIN/],
    [{ ...RELEASE_ENV, MOBILE_APPLE_TEAM_ID: '' }, /MOBILE_APPLE_TEAM_ID/],
    [{ ...RELEASE_ENV, MOBILE_IOS_BUNDLE_ID: 'game' }, /MOBILE_IOS_BUNDLE_ID/],
    [{ ...RELEASE_ENV, MOBILE_ANDROID_PACKAGE: 'com.example-game' }, /MOBILE_ANDROID_PACKAGE/],
  ])('stops a release build with missing or malformed settings: %j', (env, message) => {
    expect(() => buildConfig(env)).toThrow(message);
    expect(() => buildConfig(env)).toThrow(/운영 빌드 설정/);
  });
});

describe('development build settings', () => {
  it('uses development identifiers and adds no app link for the HTTP localhost web', () => {
    const config = buildConfig({ APP_VARIANT: 'development' });

    expect(config.ios?.bundleIdentifier).toBe('dev.side.gamefeedback');
    expect(config.ios?.deploymentTarget).toBe('17.4');
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({ NSAllowsLocalNetworking: true });
    expect(config.android?.package).toBe('dev.side.gamefeedback');
    expect(config.android?.intentFilters).toBeUndefined();
    expect(JSON.stringify(config.plugins)).toContain('usesCleartextTraffic');
  });

  it('uses developer-mode associated domains and an App Link for an HTTPS tunnel origin', () => {
    const config = buildConfig({ APP_VARIANT: 'development', EXPO_PUBLIC_WEB_ORIGIN: 'https://Dev.Example' });

    expect(config.ios?.associatedDomains).toEqual([
      'applinks:dev.example?mode=developer',
      'webcredentials:dev.example?mode=developer',
    ]);
    expect(config.android?.intentFilters?.[0]?.data).toEqual([
      { scheme: 'https', host: 'dev.example', path: '/app-auth/callback' },
    ]);
  });

  it('rejects explicitly provided malformed values even in development', () => {
    expect(() => readBuildSettings({ APP_VARIANT: 'development', MOBILE_APPLE_TEAM_ID: 'short' })).toThrow(
      /개발 빌드 설정.*MOBILE_APPLE_TEAM_ID/,
    );
  });
});
