import { describe, expect, it } from 'vitest';

import { assertSharedInstanceConfig, sharedDatabaseUrl } from './shared-instance';

const host = 'shared-postgres';
const url = (role: string) =>
  `postgresql://${role}:${'a'.repeat(64)}@${host}:5432/photo_contest?schema=public&sslmode=disable&connection_limit=5&pool_timeout=10&connect_timeout=5`;
const valid = {
  DATABASE_URL: url('photo_contest'),
  S3_REGION: 'ap-northeast-2',
  S3_BUCKET: 'side-media',
  S3_KEY_PREFIX: 'photo-contest/production',
};

describe('공통 EC2 운영 환경', () => {
  it('호스트 DB 네트워크에서 실행/DDL 역할을 구분해야 한다', () => {
    expect(sharedDatabaseUrl(valid)).toBe(valid.DATABASE_URL);
    expect(sharedDatabaseUrl({ ...valid, DATABASE_URL: url('photo_contest_migrator') }, true)).toBe(
      url('photo_contest_migrator'),
    );
    expect(() => assertSharedInstanceConfig(valid)).not.toThrow();
  });
  it.each([
    url('photo_contest_migrator'),
    url('photo_contest').replace(host, 'localhost'),
    url('photo_contest').replace('/photo_contest?', '/game_feedback?'),
    url('photo_contest').replace('sslmode=disable', 'sslmode=require'),
    `${url('photo_contest')}&sslcert=/run/rds/ca.pem`,
    `${url('photo_contest')}&options=-csearch_path=other`,
  ])('다른 DB/역할과 남은 연결 우회 설정을 거부하고 암호를 노출하지 않아야 한다', (value) => {
    expect(() => sharedDatabaseUrl({ ...valid, DATABASE_URL: value })).toThrow('DATABASE_URL');
    try {
      sharedDatabaseUrl({ ...valid, DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain('a'.repeat(64));
    }
  });
  it('로컬·다른 호스트 URL은 공통 운영 검사 대상이 아니어야 한다', () => {
    expect(() =>
      assertSharedInstanceConfig({ DATABASE_URL: url('photo_contest').replace(host, '127.0.0.1') }),
    ).not.toThrow();
  });
  it('버킷 누락, 다른 리전, R2 endpoint와 공용 버킷 설정을 거부해야 한다', () => {
    expect(() => assertSharedInstanceConfig({ ...valid, S3_BUCKET: '' })).toThrow();
    expect(() => assertSharedInstanceConfig({ ...valid, S3_REGION: 'us-east-1' })).toThrow();
    expect(() => assertSharedInstanceConfig({ ...valid, S3_ENDPOINT: 'https://storage.test' })).toThrow();
  });
  it('공용 버킷에서는 CI 테스트 폴더를 포함해 photo-contest 폴더 안에서만 써야 한다', () => {
    expect(() =>
      assertSharedInstanceConfig({ ...valid, S3_KEY_PREFIX: 'photo-contest/ci/tests/run1' }),
    ).not.toThrow();
  });
  it.each([undefined, '', 'photo-contest', 'game-feedback/production', 'photo-contest/../game-feedback'])(
    '버킷 최상위·서비스 최상위·다른 서비스 경로 %s를 거부해야 한다',
    (prefix) => {
      expect(() => assertSharedInstanceConfig({ ...valid, S3_KEY_PREFIX: prefix })).toThrow(
        'photo-contest/<folder>',
      );
    },
  );
});
