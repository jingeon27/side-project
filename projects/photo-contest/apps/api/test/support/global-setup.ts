import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { TestProject } from 'vitest/node';

import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
  FAKE_S3_DEFAULTS,
  isolatedSchemaName,
  loadProjectEnv,
  PROJECT_ROOT,
  resolveTestDatabaseUrl,
  startFakeS3,
} from '@photo-contest/test-kit';

declare module 'vitest' {
  export interface ProvidedContext {
    /** 이번 실행 전용 격리 스키마를 가리키는 DATABASE_URL */
    databaseUrl: string;
    /** 이번 실행 전용 S3 대역 설정(S3_*·AWS_*). 끝나면 객체 폴더까지 지운다. */
    s3Env: Record<string, string>;
  }
}

/**
 * api 레인 전체가 격리 스키마와 S3 대역 하나를 함께 쓴다. 스키마는 테스트 전용 DB(TEST_DATABASE_URL)에만 만들고
 * public 스키마는 건드리지 않는다.
 */
export default async function setup(project: TestProject) {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = isolatedSchemaName('api_test');
  const storageDir = resolve(PROJECT_ROOT, '.data', schema);
  // supertest·fetch만 저장소를 부르므로 브라우저 CORS origin은 열지 않는다.
  const s3 = await startFakeS3({ ...FAKE_S3_DEFAULTS, directory: storageDir, corsOrigins: [] });
  try {
    project.provide('databaseUrl', await createIsolatedDatabase(baseUrl, schema));
  } catch (error) {
    await s3.stop();
    await rm(storageDir, { recursive: true, force: true });
    throw error;
  }
  project.provide('s3Env', s3.env);
  return async function teardown() {
    await dropIsolatedDatabase(baseUrl, schema);
    await s3.stop();
    await rm(storageDir, { recursive: true, force: true });
  };
}
