import { describe, expect, it } from 'vitest';

import { sharedDatabaseUrl, validateSharedInstanceEnvironment } from './shared-instance.config';

const host = 'side.abcdef.ap-northeast-2.rds.amazonaws.com';
const url = (role: string) =>
  `postgresql://${role}:${'a'.repeat(64)}@${host}:5432/game_feedback?schema=public&sslmode=require&sslaccept=strict&sslcert=/run/rds/ca.pem&connection_limit=5&pool_timeout=10&connect_timeout=5`;
const valid = {
  DEPLOYMENT_TARGET: 'shared-instance',
  RDS_HOST: host,
  DATABASE_URL: url('game_feedback'),
  DATABASE_MIGRATION_URL: url('game_feedback_migrator'),
  GF_MEDIA_STORAGE: 'S3',
  GF_S3_REGION: 'ap-northeast-2',
  GF_S3_BUCKET: 'gf-private',
  OTHER_SERVICE_S3_BUCKET: 'pc-private',
};

describe('shared EC2 deployment', () => {
  it('separates the RDS runtime and migration roles and requires verified TLS', () => {
    expect(sharedDatabaseUrl(valid)).toBe(valid.DATABASE_URL);
    expect(sharedDatabaseUrl(valid, true)).toBe(valid.DATABASE_MIGRATION_URL);
    expect(() => validateSharedInstanceEnvironment(valid)).not.toThrow();
  });
  it.each([
    url('game_feedback_migrator'),
    url('game_feedback').replace(host, 'localhost'),
    url('game_feedback').replace('/game_feedback?', '/photo_contest?'),
    url('game_feedback').replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'),
    url('game_feedback').replace('sslmode=require', 'sslmode=prefer'),
    url('game_feedback').replace('connection_limit=5', 'connection_limit=50'),
    `${url('game_feedback')}&sslmode=disable`,
    `${url('game_feedback')}&host=/tmp`,
  ])('rejects another service, a DDL login and TLS bypasses without leaking the URL', (value) => {
    expect(() => sharedDatabaseUrl({ ...valid, DATABASE_URL: value })).toThrow('DATABASE_URL');
    try {
      sharedDatabaseUrl({ ...valid, DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain('a'.repeat(64));
    }
  });
  it('refuses local storage, R2 endpoints, and shared buckets in the production template', () => {
    expect(() => validateSharedInstanceEnvironment({ ...valid, GF_MEDIA_STORAGE: 'FILESYSTEM' })).toThrow();
    expect(() =>
      validateSharedInstanceEnvironment({ ...valid, GF_S3_ENDPOINT: 'https://storage.test' }),
    ).toThrow();
    expect(() => validateSharedInstanceEnvironment({ ...valid, GF_S3_BUCKET: 'pc-private' })).toThrow();
  });
});
