import { describe, expect, it } from 'vitest';

import { resolveMediaStorageConfig } from '../media-storage/media-storage.config';
import { resolveListenConfig, validateProductionEnvironment } from './production.config';

const valid = {
  ENVIRONMENT: 'production',
  GF_S3_BUCKET: 'private-bucket',
  GF_S3_REGION: 'ap-northeast-2',
  WEB_ORIGIN: 'https://play.game-feedback.test',
  GAME_FEEDBACK_CONTACT_EMAIL: 'operator@game-feedback.test',
  DATABASE_URL: `postgresql://game_feedback:${'a'.repeat(64)}@db:5432/game_feedback`,
  GOOGLE_CLIENT_ID: 'production-client',
  GOOGLE_CLIENT_SECRET: 'production-secret',
};

describe('production startup configuration', () => {
  it('accepts private container binding and a configured HTTPS OAuth application', () => {
    expect(() => validateProductionEnvironment(valid)).not.toThrow();
    expect(
      resolveListenConfig({ ENVIRONMENT: 'production', GAME_FEEDBACK_API_URL: 'http://api:4300' }),
    ).toEqual({ HOST: '0.0.0.0', PORT: 4300 });
    expect(resolveMediaStorageConfig(valid)).toEqual({
      bucket: 'private-bucket',
      region: 'ap-northeast-2',
      forcePathStyle: false,
      keyPrefix: '',
    });
  });
  it.each([
    { WEB_ORIGIN: 'http://localhost:3300' },
    { GOOGLE_CLIENT_SECRET: '' },
    { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
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
  it('requires a bucket and rejects insecure object storage in production', () => {
    expect(() => resolveMediaStorageConfig({ ...valid, GF_S3_BUCKET: '' })).toThrow();
    expect(() =>
      resolveMediaStorageConfig({
        ...valid,
        GF_S3_BUCKET: 'private-bucket',
        GF_S3_ACCESS_KEY_ID: 'id',
        GF_S3_SECRET_ACCESS_KEY: 'private-secret',
        GF_S3_ENDPOINT: 'http://storage.test',
      }),
    ).toThrow();
    expect(() => resolveListenConfig({ GAME_FEEDBACK_API_URL: 'http://127.0.0.1:65536' })).toThrow();
  });
});
