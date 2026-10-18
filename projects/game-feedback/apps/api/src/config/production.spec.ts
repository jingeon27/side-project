import { describe, expect, it } from 'vitest';
import { resolveListenConfig, validateProductionEnvironment } from './production.config';
import { resolveMediaStorageConfig } from '../media-storage/media-storage.config';

const valid = {
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://play.game-feedback.test',
  GAME_FEEDBACK_SITE_URL: 'https://play.game-feedback.test',
  GAME_FEEDBACK_CONTACT_EMAIL: 'operator@game-feedback.test',
  GF_DEMO_MODE: 'false',
  GF_TEST_AUTH_ENABLED: 'false',
  DATABASE_URL: `postgresql://game_feedback:${'a'.repeat(64)}@db:5432/game_feedback`,
  GOOGLE_CLIENT_ID: 'production-client',
  GOOGLE_CLIENT_SECRET: 'production-secret',
};

describe('production startup configuration', () => {
  it('accepts private container binding and a configured HTTPS OAuth application', () => {
    expect(() => validateProductionEnvironment(valid)).not.toThrow();
    expect(resolveListenConfig({ HOST: '0.0.0.0', PORT: '4300' })).toEqual({ HOST: '0.0.0.0', PORT: 4300 });
    expect(resolveMediaStorageConfig(valid)).toEqual({
      driver: 'FILESYSTEM',
      directory: '/var/lib/game-feedback/media',
    });
  });
  it.each([
    { GF_DEMO_MODE: 'true' },
    { GF_TEST_AUTH_ENABLED: 'true' },
    { GF_PREFETCH_TESTING: 'true' },
    { WEB_ORIGIN: 'http://localhost:3300' },
    { GAME_FEEDBACK_SITE_URL: 'https://other.game-feedback.test' },
    { GOOGLE_CLIENT_SECRET: '' },
    { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
    { X_CLIENT_ID: 'partial-provider' },
    { GOOGLE_REDIRECT_URI: 'https://other.game-feedback.test/callback' },
  ])('refuses unsafe production configuration: %j', (override) => {
    expect(() => validateProductionEnvironment({ ...valid, ...override })).toThrow();
  });
  it('does not reveal a database credential in validation failures', () => {
    const credential = 'private-short-password';
    try {
      validateProductionEnvironment({
        ...valid,
        DATABASE_URL: `postgresql://game_feedback:${credential}@db/game_feedback`,
      });
      expect.fail('Expected startup rejection');
    } catch (error) {
      expect(String(error)).not.toContain(credential);
      expect(String(error)).toContain('DATABASE_URL');
    }
  });
  it('rejects database uploads and insecure object storage in production', () => {
    expect(() => resolveMediaStorageConfig({ ...valid, GF_MEDIA_STORAGE: 'DATABASE' })).toThrow();
    expect(() =>
      resolveMediaStorageConfig({
        ...valid,
        GF_MEDIA_STORAGE: 'S3',
        GF_S3_BUCKET: 'private-bucket',
        GF_S3_ACCESS_KEY_ID: 'id',
        GF_S3_SECRET_ACCESS_KEY: 'private-secret',
        GF_S3_ENDPOINT: 'http://storage.test',
      }),
    ).toThrow();
    expect(() => resolveListenConfig({ PORT: '65536' })).toThrow();
  });
});
