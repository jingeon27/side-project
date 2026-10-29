import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig, { readBuildSettings } from './app.config';

afterEach(() => vi.unstubAllEnvs());
describe('root project build settings', () => {
  it('uses the root web origin and limits cleartext to development', () => {
    expect(readBuildSettings({ ENVIRONMENT: 'development', WEB_ORIGIN: 'http://localhost:3300' })).toEqual({
      isDevelopment: true,
      webOrigin: 'http://localhost:3300',
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
