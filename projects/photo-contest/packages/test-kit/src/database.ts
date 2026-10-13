import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@photo-contest/api/database-client';

import { PRISMA_CLI, PRISMA_SCHEMA } from './paths';

const SCHEMA_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function assertSchemaName(schema: string) {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`격리 스키마 이름이 올바르지 않습니다: ${schema}`);
  return schema;
}

/** 실행마다 겹치지 않는 스키마 이름. prefix는 소문자·숫자·_만 쓴다. */
export function isolatedSchemaName(prefix: string) {
  return assertSchemaName(`${prefix}_${randomUUID().replaceAll('-', '')}`);
}

/** 테스트가 운영 DB를 건드리지 않도록 로컬 DB만 허용한다. */
export function assertLocalDatabase(databaseUrl: string) {
  const { hostname } = new URL(databaseUrl);
  if (!LOCAL_HOSTS.has(hostname) && process.env.PC_TEST_ALLOW_REMOTE_DATABASE !== 'true')
    throw new Error(
      '테스트는 로컬 개발 DB에서만 실행합니다. 원격 DB라면 PC_TEST_ALLOW_REMOTE_DATABASE=true를 명시하세요.',
    );
}

export function schemaUrl(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', assertSchemaName(schema));
  return url.toString();
}

/** 스키마를 만들고 마이그레이션을 적용한 뒤 그 스키마를 가리키는 URL을 돌려준다. */
export async function createIsolatedDatabase(databaseUrl: string, schema: string) {
  assertLocalDatabase(databaseUrl);
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${assertSchemaName(schema)}"`);
  } finally {
    await admin.$disconnect();
  }
  const url = schemaUrl(databaseUrl, schema);
  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy', '--schema', PRISMA_SCHEMA], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return url;
}

/** 격리 스키마만 지운다. 다른 스키마와 데이터는 건드리지 않는다. */
export async function dropIsolatedDatabase(databaseUrl: string, schema: string) {
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${assertSchemaName(schema)}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}

/** 테스트에서 마감 시각 변경처럼 화면으로 만들 수 없는 상태를 준비할 때 쓴다. */
export function createDatabaseClient(databaseUrl: string) {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
