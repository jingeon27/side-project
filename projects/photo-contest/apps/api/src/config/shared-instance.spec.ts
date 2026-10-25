import { describe, expect, it } from 'vitest';

import { assertSharedInstanceConfig, sharedDatabaseUrl } from './shared-instance';

const host = 'side.abcdef.ap-northeast-2.rds.amazonaws.com';
const url = (role: string) =>
  `postgresql://${role}:${'a'.repeat(64)}@${host}:5432/photo_contest?schema=public&sslmode=require&sslaccept=strict&sslcert=/run/rds/ca.pem&connection_limit=5&pool_timeout=10&connect_timeout=5`;
const valid = {
  DATABASE_URL: url('photo_contest'),
  S3_REGION: 'ap-northeast-2',
  S3_BUCKET: 'pc-private',
};

describe('공통 EC2 운영 환경', () => {
  it('RDS의 실행/DDL 역할을 구분하고 인증서 검증을 요구해야 한다', () => {
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
    url('photo_contest').replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'),
    url('photo_contest').replace('sslmode=require', 'sslmode=disable'),
    `${url('photo_contest')}&options=-csearch_path=other`,
  ])('다른 DB/역할과 TLS 우회를 거부하고 암호를 노출하지 않아야 한다', (value) => {
    expect(() => sharedDatabaseUrl({ ...valid, DATABASE_URL: value })).toThrow('DATABASE_URL');
    try {
      sharedDatabaseUrl({ ...valid, DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain('a'.repeat(64));
    }
  });
  it('버킷 누락, 다른 리전, R2 endpoint와 공용 버킷 설정을 거부해야 한다', () => {
    expect(() => assertSharedInstanceConfig({ ...valid, S3_BUCKET: '' })).toThrow();
    expect(() => assertSharedInstanceConfig({ ...valid, S3_REGION: 'us-east-1' })).toThrow();
    expect(() => assertSharedInstanceConfig({ ...valid, S3_ENDPOINT: 'https://storage.test' })).toThrow();
  });
});
