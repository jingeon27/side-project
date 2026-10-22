import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertTestDatabaseUrl,
  assertTestSchemaName,
  dropIsolatedDatabase,
  isolatedSchemaName,
  resolveTestDatabaseUrl,
  schemaUrl,
} from './database';

const TEST_URL = 'postgresql://contest:contest@127.0.0.1:55434/photo_contest_test?schema=public';

beforeEach(() => {
  vi.stubEnv('TEST_DATABASE_URL', undefined);
  vi.stubEnv('DATABASE_URL', undefined);
  vi.stubEnv('LOCAL_TEST_POSTGRES_PORT', undefined);
  vi.stubEnv('LOCAL_POSTGRES_PORT', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('resolveTestDatabaseUrl', () => {
  it('TEST_DATABASE_URL이 없으면 개발 DATABASE_URL로 대신하지 않고 실패해야 한다', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://contest:contest@127.0.0.1:55432/photo_contest?schema=public');
    expect(() => resolveTestDatabaseUrl()).toThrow('TEST_DATABASE_URL');
  });

  it('전용 테스트 DB URL을 그대로 돌려줘야 한다', () => {
    vi.stubEnv('TEST_DATABASE_URL', TEST_URL);
    expect(resolveTestDatabaseUrl()).toBe(TEST_URL);
  });
});

describe('assertTestDatabaseUrl', () => {
  it.each([
    ['localhost', TEST_URL.replace('127.0.0.1', 'localhost')],
    ['IPv6 loopback', TEST_URL.replace('127.0.0.1', '[::1]')],
    ['schema 생략', TEST_URL.replace('?schema=public', '')],
  ])('loopback 전용 포트의 테스트 DB를 허용해야 한다: %s', (_, url) => {
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    ['원격 호스트', TEST_URL.replace('127.0.0.1', 'db.example.com')],
    ['개발 DB 포트', TEST_URL.replace(':55434/', ':55432/')],
    ['포트 생략', TEST_URL.replace(':55434/', '/')],
    ['개발 DB 이름', TEST_URL.replace('/photo_contest_test?', '/photo_contest?')],
    ['PostgreSQL이 아닌 URL', TEST_URL.replace('postgresql:', 'mysql:')],
    ['남의 스키마', TEST_URL.replace('schema=public', 'schema=game_feedback')],
    ['URL이 아닌 값', 'not a url'],
  ])('테스트 DB가 아닌 곳은 거부해야 한다: %s', (_, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow();
  });

  it('오류 메시지에 비밀번호를 남기지 않아야 한다', () => {
    expect(() => assertTestDatabaseUrl(TEST_URL.replace('127.0.0.1', 'db.example.com'))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('contest@') }),
    );
  });

  it('LOCAL_TEST_POSTGRES_PORT로 바꾼 전용 포트만 허용해야 한다', () => {
    vi.stubEnv('LOCAL_TEST_POSTGRES_PORT', '55435');
    expect(() => assertTestDatabaseUrl(TEST_URL)).toThrow('55435');
    expect(assertTestDatabaseUrl(TEST_URL.replace(':55434/', ':55435/'))).toContain(':55435/');
  });

  it('테스트 포트를 개발 DB 포트와 같게 설정하면 거부해야 한다', () => {
    vi.stubEnv('LOCAL_TEST_POSTGRES_PORT', '55432');
    expect(() => assertTestDatabaseUrl(TEST_URL.replace(':55434/', ':55432/'))).toThrow(
      'LOCAL_TEST_POSTGRES_PORT',
    );
  });
});

describe('격리 스키마 이름', () => {
  it('레인 접두사와 uuid로 만든 이름만 허용해야 한다', () => {
    const schema = isolatedSchemaName('web_e2e');
    expect(schema).toMatch(/^web_e2e_[0-9a-f]{32}$/);
    expect(assertTestSchemaName(schema, 'web_e2e')).toBe(schema);
    expect(() => assertTestSchemaName(schema, 'mobile_e2e')).toThrow();
  });

  it.each([
    'public',
    'photo_contest',
    'web_e2e_',
    `web_e2e_${'a'.repeat(31)}`,
    `unknown_${'a'.repeat(32)}`,
    `web_e2e_${'a'.repeat(32)}"; DROP SCHEMA public CASCADE; --`,
  ])('%s는 거부해야 한다', (schema) => {
    expect(() => assertTestSchemaName(schema)).toThrow();
  });

  it('schemaUrl은 테스트 DB와 격리 스키마를 함께 검사해야 한다', () => {
    const schema = isolatedSchemaName('api_test');
    expect(new URL(schemaUrl(TEST_URL, schema)).searchParams.get('schema')).toBe(schema);
    expect(() => schemaUrl(TEST_URL, 'public')).toThrow();
    expect(() => schemaUrl(TEST_URL.replace(':55434/', ':55432/'), schema)).toThrow();
  });

  it('dropIsolatedDatabase는 DB에 연결하기 전에 public 삭제를 거부해야 한다', async () => {
    await expect(dropIsolatedDatabase(TEST_URL, 'public')).rejects.toThrow('격리 스키마');
    await expect(
      dropIsolatedDatabase(TEST_URL.replace(':55434/', ':55432/'), isolatedSchemaName('api_test')),
    ).rejects.toThrow('전용 포트');
  });
});
