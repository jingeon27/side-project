import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig, { readBuildSettings } from './app.config';

// 실제 프로젝트·스토어 ID가 아닌 형식만 맞춘 값이다.
const EAS_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const APP_STORE_ID = '1000000001';

function buildProductionConfig() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('WEB_ORIGIN', 'https://site.example');
  return appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
}

afterEach(() => vi.unstubAllEnvs());
describe('root project build settings', () => {
  it('uses the root web origin and limits cleartext to development', () => {
    expect(readBuildSettings({ NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:3200' })).toEqual({
      isDevelopment: true,
      webOrigin: 'http://localhost:3200',
      easProjectId: null,
      iosAppStoreId: null,
    });
    for (const WEB_ORIGIN of [
      '',
      'http://site.example',
      'https://user:pass@site.example',
      'https://site.example/path',
    ])
      expect(() => readBuildSettings({ NODE_ENV: 'production', WEB_ORIGIN })).toThrow('WEB_ORIGIN');
  });
  it('includes only public telemetry settings in the native bundle', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://site.example');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@sentry.example/1');
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-amplitude-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'server-only-credential-marker');
    const config = appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
    expect(config.extra).toMatchObject({
      webOrigin: 'https://site.example',
      sentryDsn: 'https://public@sentry.example/1',
      amplitudeApiKey: 'public-amplitude-key',
    });
    expect(JSON.stringify(config)).not.toContain('server-only-credential-marker');
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.android?.allowBackup).toBe(false);
    expect(config.ios?.infoPlist).not.toHaveProperty('NSAppTransportSecurity');
    expect(JSON.stringify(config.plugins)).not.toContain('usesCleartextTraffic');
  });
});

describe('푸시·스토어 설정', () => {
  it('루트 설정의 EAS projectId와 App Store ID를 앱 설정에 넘겨야 한다', () => {
    vi.stubEnv('MOBILE_EAS_PROJECT_ID', EAS_PROJECT_ID);
    vi.stubEnv('MOBILE_IOS_APP_STORE_ID', ` ${APP_STORE_ID} `);

    expect(buildProductionConfig().extra).toMatchObject({
      eas: { projectId: EAS_PROJECT_ID },
      iosAppStoreId: APP_STORE_ID,
    });
  });

  it('값이 비어 있으면 projectId 없이 iOS 스토어 ID를 null로 넘겨야 한다', () => {
    vi.stubEnv('MOBILE_EAS_PROJECT_ID', '');
    vi.stubEnv('MOBILE_IOS_APP_STORE_ID', ' ');

    const config = buildProductionConfig();

    expect(config.extra).not.toHaveProperty('eas');
    expect(config.extra).toHaveProperty('iosAppStoreId', null);
  });

  it('형식이 틀린 값이면 기능을 조용히 끄지 않고 빌드를 멈춰야 한다', () => {
    for (const MOBILE_EAS_PROJECT_ID of ['eas-project', '22222222-2222-1222-8222-222222222222'])
      expect(() => readBuildSettings({ NODE_ENV: 'development', MOBILE_EAS_PROJECT_ID })).toThrow(
        'MOBILE_EAS_PROJECT_ID',
      );
    for (const MOBILE_IOS_APP_STORE_ID of [
      `id${APP_STORE_ID}`,
      `https://apps.apple.com/app/id${APP_STORE_ID}`,
    ])
      expect(() => readBuildSettings({ NODE_ENV: 'development', MOBILE_IOS_APP_STORE_ID })).toThrow(
        'MOBILE_IOS_APP_STORE_ID',
      );
  });
});
