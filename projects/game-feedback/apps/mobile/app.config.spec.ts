import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig, { readBuildSettings } from './app.config';

// 실제 EAS 프로젝트가 아닌 형식만 맞춘 값이다.
const EAS_PROJECT_ID = '33333333-3333-4333-8333-333333333333';

function buildProductionConfig() {
  vi.stubEnv('ENVIRONMENT', 'production');
  vi.stubEnv('WEB_ORIGIN', 'https://site.example');
  return appConfig({ projectRoot: '.', staticConfigPath: null, packageJsonPath: null, config: {} });
}

afterEach(() => vi.unstubAllEnvs());
describe('root project build settings', () => {
  it('uses the root web origin and limits cleartext to development', () => {
    expect(readBuildSettings({ ENVIRONMENT: 'development', WEB_ORIGIN: 'http://localhost:3300' })).toEqual({
      isDevelopment: true,
      webOrigin: 'http://localhost:3300',
      easProjectId: null,
    });
    for (const WEB_ORIGIN of [
      '',
      'http://site.example',
      'https://user:pass@site.example',
      'https://site.example/path',
    ])
      expect(() => readBuildSettings({ ENVIRONMENT: 'production', WEB_ORIGIN })).toThrow('WEB_ORIGIN');
  });
  it('includes only public telemetry settings in the native bundle', () => {
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://site.example');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@sentry.example/1');
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-amplitude-key');
    vi.stubEnv('GF_S3_SECRET_ACCESS_KEY', 'server-only-credential-marker');
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

describe('푸시 설정', () => {
  it('루트 설정의 EAS projectId를 native-push가 읽는 extra.eas.projectId로 넘겨야 한다', () => {
    vi.stubEnv('MOBILE_EAS_PROJECT_ID', ` ${EAS_PROJECT_ID} `);

    expect(buildProductionConfig().extra).toMatchObject({ eas: { projectId: EAS_PROJECT_ID } });
  });

  it('값이 비어 있으면 projectId 없이 빌드해 앱 푸시를 꺼야 한다', () => {
    vi.stubEnv('MOBILE_EAS_PROJECT_ID', ' ');

    expect(buildProductionConfig().extra).not.toHaveProperty('eas');
  });

  it('형식이 틀린 값이면 푸시를 조용히 끄지 않고 빌드를 멈춰야 한다', () => {
    for (const MOBILE_EAS_PROJECT_ID of ['eas-project', '33333333-3333-1333-8333-333333333333'])
      expect(() => readBuildSettings({ ENVIRONMENT: 'development', MOBILE_EAS_PROJECT_ID })).toThrow(
        'MOBILE_EAS_PROJECT_ID',
      );
  });
});
