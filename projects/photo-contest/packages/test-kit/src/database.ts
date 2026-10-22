import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@photo-contest/api/database-client';

import { PRISMA_CLI, PRISMA_SCHEMA } from './paths';

/** 테스트 레인이 만드는 격리 스키마의 접두사. 만들고 지우는 스키마는 `<접두사>_<uuid 32자>`뿐이다. */
export const TEST_SCHEMA_PREFIXES = [
  'api_test',
  'web_api',
  'web_e2e',
  'web_cache',
  'mobile_api',
  'mobile_e2e',
] as const;
export type TTestSchemaPrefix = (typeof TEST_SCHEMA_PREFIXES)[number];

const OWNED_SCHEMA = new RegExp(`^(?:${TEST_SCHEMA_PREFIXES.join('|')})_[0-9a-f]{32}$`);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TEST_DATABASE_NAME = 'photo_contest_test';
const DEFAULT_TEST_PORT = '55434';
const DEFAULT_DEVELOPMENT_PORT = '55432';

/** 오류 메시지에 URL을 넣지 않는다(비밀번호가 들어 있을 수 있다). */
function testDatabasePort() {
  const port = process.env.LOCAL_TEST_POSTGRES_PORT ?? DEFAULT_TEST_PORT;
  const development = process.env.LOCAL_POSTGRES_PORT ?? DEFAULT_DEVELOPMENT_PORT;
  if (!/^[1-9][0-9]{0,4}$/.test(port) || port === development)
    throw new Error('LOCAL_TEST_POSTGRES_PORT는 개발 DB(LOCAL_POSTGRES_PORT)와 다른 포트여야 합니다.');
  return port;
}

/** 격리 스키마 이름이 테스트 레인이 만든 형식인지 확인한다. prefix를 주면 그 레인의 이름만 허용한다. */
export function assertTestSchemaName(schema: string, prefix?: TTestSchemaPrefix) {
  const owned = prefix ? new RegExp(`^${prefix}_[0-9a-f]{32}$`) : OWNED_SCHEMA;
  if (!OWNED_SCHEMA.test(schema) || !owned.test(schema))
    throw new Error(
      `테스트가 만든 격리 스키마(<레인 접두사>_<uuid>)만 쓸 수 있습니다: ${schema.slice(0, 80)}`,
    );
  return schema;
}

/**
 * 테스트 DB는 loopback의 전용 포트(기본 55434, LOCAL_TEST_POSTGRES_PORT)·photo_contest_test만 허용한다.
 * 개발 DB(55432)나 원격 DB에는 스키마를 만들거나 지우지 않는다.
 */
export function assertTestDatabaseUrl(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL은 올바른 PostgreSQL URL이어야 합니다.');
  }
  const port = testDatabasePort();
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    throw new Error('테스트 DB는 PostgreSQL URL만 허용합니다.');
  if (!LOOPBACK_HOSTS.has(url.hostname))
    throw new Error('테스트 DB는 loopback 주소(127.0.0.1·localhost·[::1])만 허용합니다.');
  if (url.port !== port) throw new Error(`테스트 DB는 전용 포트 ${port}만 허용합니다.`);
  if (url.pathname !== `/${TEST_DATABASE_NAME}`)
    throw new Error(`테스트 DB는 ${TEST_DATABASE_NAME} 데이터베이스만 허용합니다.`);
  const schema = url.searchParams.get('schema');
  if (schema !== null && schema !== 'public') assertTestSchemaName(schema);
  return databaseUrl;
}

/** 실행마다 겹치지 않는 스키마 이름. 접두사는 TEST_SCHEMA_PREFIXES 중 하나다. */
export function isolatedSchemaName(prefix: TTestSchemaPrefix) {
  return assertTestSchemaName(`${prefix}_${randomUUID().replaceAll('-', '')}`, prefix);
}

/** 테스트 전용 DB URL. 개발 DATABASE_URL로 대신하지 않는다. */
export function resolveTestDatabaseUrl() {
  const dedicated = process.env.TEST_DATABASE_URL;
  if (!dedicated)
    throw new Error(
      'TEST_DATABASE_URL이 필요합니다. `yarn workspace @side/photo-contest db:test:local`로 테스트 DB(기본 55434)를 띄우고 projects/photo-contest/.env를 확인하세요.',
    );
  return assertTestDatabaseUrl(dedicated);
}

export function schemaUrl(databaseUrl: string, schema: string) {
  const url = new URL(assertTestDatabaseUrl(databaseUrl));
  url.searchParams.set('schema', assertTestSchemaName(schema));
  return url.toString();
}

/** 스키마를 만들고 마이그레이션을 적용한 뒤 그 스키마를 가리키는 URL을 돌려준다. */
export async function createIsolatedDatabase(databaseUrl: string, schema: string) {
  const url = schemaUrl(databaseUrl, schema);
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await admin.$disconnect();
  }
  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy', '--schema', PRISMA_SCHEMA], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return url;
}

/** 테스트가 만든 격리 스키마만 지운다. public 등 다른 스키마는 연결하기 전에 거부한다. */
export async function dropIsolatedDatabase(databaseUrl: string, schema: string) {
  assertTestDatabaseUrl(databaseUrl);
  assertTestSchemaName(schema);
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}

/** 테스트에서 마감 시각 변경처럼 화면으로 만들 수 없는 상태를 준비할 때 쓴다. */
export function createDatabaseClient(databaseUrl: string) {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
