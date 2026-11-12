import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiHost, apiPort, assertProductionConfig, awsCredentials, trustedProxyHops, webOrigin } from './env';

afterEach(() => vi.unstubAllEnvs());

describe('runtime settings from the project env', () => {
  it('derives API binding from API_URL and the runtime mode', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_URL', 'http://127.0.0.1:4321');
    expect(apiPort()).toBe(4321);
    expect(apiHost()).toBe('127.0.0.1');
    expect(trustedProxyHops()).toBe(0);
    vi.stubEnv('NODE_ENV', 'production');
    expect(apiHost()).toBe('0.0.0.0');
    expect(trustedProxyHops()).toBe(1);
  });
  it('rejects unsafe S3 endpoints and path traversal before production starts', () => {
    for (const [name, value] of Object.entries({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://contest.example',
      DATABASE_URL: 'postgresql://contest@db/contest',
      S3_BUCKET: 'contest-media',
      S3_ENDPOINT: '',
      S3_KEY_PREFIX: '',
    }))
      vi.stubEnv(name, value);
    expect(() => assertProductionConfig()).not.toThrow();
    vi.stubEnv('S3_KEY_PREFIX', '../escape');
    expect(() => assertProductionConfig()).toThrow('S3_KEY_PREFIX');
    vi.stubEnv('S3_KEY_PREFIX', 'photo-contest/local');
    for (const invalid of ['not a url', 'ftp://storage.example']) {
      vi.stubEnv('S3_ENDPOINT', invalid);
      expect(() => assertProductionConfig()).toThrow('S3_ENDPOINT');
    }
    vi.stubEnv('S3_ENDPOINT', 'https://storage.example');
    expect(() => assertProductionConfig()).not.toThrow();
  });
  it('uses the configured web origin without a path', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://contest.example/app/');
    expect(webOrigin()).toBe('https://contest.example');
  });
  it('passes AWS keys to the storage client only when both the key id and the secret are set', () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'unit-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '');
    vi.stubEnv('AWS_SESSION_TOKEN', 'unit-session');
    expect(awsCredentials()).toBeUndefined();
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'unit-secret');
    expect(awsCredentials()).toStrictEqual({
      accessKeyId: 'unit-key',
      secretAccessKey: 'unit-secret',
      sessionToken: 'unit-session',
    });
    vi.stubEnv('AWS_SESSION_TOKEN', '');
    expect(awsCredentials()).toStrictEqual({ accessKeyId: 'unit-key', secretAccessKey: 'unit-secret' });
  });
});
