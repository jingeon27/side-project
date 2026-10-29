import { describe, expect, it } from 'vitest';

import {
  sharedDatabaseUrl,
  usesSharedDatabase,
  validateSharedInstanceEnvironment,
} from './shared-instance.config';

const host = 'shared-postgres';
const url = (role: string) =>
  `postgresql://${role}:${'a'.repeat(64)}@${host}:5432/game_feedback?schema=public&sslmode=disable&connection_limit=5&pool_timeout=10&connect_timeout=5`;
const valid = {
  DATABASE_URL: url('game_feedback'),
  GF_S3_REGION: 'ap-northeast-2',
  GF_S3_BUCKET: 'side-media',
  GF_S3_KEY_PREFIX: 'game-feedback/production',
};

describe('shared EC2 deployment', () => {
  it('separates the runtime and migration roles on the host database network', () => {
    expect(sharedDatabaseUrl(valid)).toBe(valid.DATABASE_URL);
    expect(sharedDatabaseUrl({ ...valid, DATABASE_URL: url('game_feedback_migrator') }, true)).toBe(
      url('game_feedback_migrator'),
    );
    expect(() => validateSharedInstanceEnvironment(valid)).not.toThrow();
  });
  it.each([
    url('game_feedback_migrator'),
    url('game_feedback').replace(host, 'localhost'),
    url('game_feedback').replace('/game_feedback?', '/photo_contest?'),
    url('game_feedback').replace('sslmode=disable', 'sslmode=require'),
    url('game_feedback').replace('connection_limit=5', 'connection_limit=50'),
    `${url('game_feedback')}&sslcert=/run/rds/ca.pem`,
    `${url('game_feedback')}&sslmode=disable`,
    `${url('game_feedback')}&host=/tmp`,
  ])(
    'rejects another service, a DDL login and leftover connection overrides without leaking the URL',
    (value) => {
      expect(() => sharedDatabaseUrl({ ...valid, DATABASE_URL: value })).toThrow('DATABASE_URL');
      try {
        sharedDatabaseUrl({ ...valid, DATABASE_URL: value });
      } catch (error) {
        expect(String(error)).not.toContain('a'.repeat(64));
      }
    },
  );
  it('leaves local, test and other hosts to the regular database URL guard', () => {
    const local = url('game_feedback').replace(host, '127.0.0.1');
    const rds = url('game_feedback').replace(host, 'side.abcdef.ap-northeast-2.rds.amazonaws.com');
    expect(usesSharedDatabase(valid)).toBe(true);
    expect(usesSharedDatabase({ DATABASE_URL: local })).toBe(false);
    expect(usesSharedDatabase({ DATABASE_URL: rds })).toBe(false);
    expect(() => validateSharedInstanceEnvironment({ DATABASE_URL: local })).not.toThrow();
  });
  it('refuses missing buckets, custom endpoints, and shared buckets in the production template', () => {
    expect(() => validateSharedInstanceEnvironment({ ...valid, GF_S3_BUCKET: '' })).toThrow();
    expect(() =>
      validateSharedInstanceEnvironment({ ...valid, GF_S3_ENDPOINT: 'https://storage.test' }),
    ).toThrow();
  });
  it('keeps the shared bucket inside a game-feedback folder, including CI test folders', () => {
    expect(() =>
      validateSharedInstanceEnvironment({ ...valid, GF_S3_KEY_PREFIX: 'game-feedback/ci/tests/run1' }),
    ).not.toThrow();
  });
  it.each([undefined, '', 'game-feedback', 'photo-contest/production', 'game-feedback/../photo-contest'])(
    'rejects a bucket-root, service-root or foreign prefix (%s)',
    (prefix) => {
      expect(() => validateSharedInstanceEnvironment({ ...valid, GF_S3_KEY_PREFIX: prefix })).toThrow(
        'game-feedback/<folder>',
      );
    },
  );
});
