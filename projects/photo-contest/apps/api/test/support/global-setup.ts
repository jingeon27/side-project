import type { TestProject } from 'vitest/node';

import {
  cleanupS3TestObjects,
  createIsolatedDatabase,
  dropIsolatedDatabase,
  isolatedSchemaName,
  loadProjectEnv,
  resolveTestDatabaseUrl,
  s3TestEnvironment,
  verifyS3TestAccess,
} from '@photo-contest/test-kit';

declare module 'vitest' {
  export interface ProvidedContext {
    /** 이번 실행 전용 격리 스키마를 가리키는 DATABASE_URL */
    databaseUrl: string;
    s3Env: Record<string, string>;
  }
}

/**
 * api 레인 전체가 격리 스키마와 실제 S3의 실행별 객체 경로를 함께 쓴다. 스키마는 테스트 전용 DB(TEST_DATABASE_URL)에만 만들고
 * public 스키마는 건드리지 않는다.
 */
export default async function setup(project: TestProject) {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = isolatedSchemaName('api_test');
  const s3Env = s3TestEnvironment(process.env, schema);
  await verifyS3TestAccess(s3Env);
  project.provide('databaseUrl', await createIsolatedDatabase(baseUrl, schema));
  project.provide('s3Env', s3Env);
  return async function teardown() {
    try {
      await cleanupS3TestObjects(s3Env);
    } finally {
      await dropIsolatedDatabase(baseUrl, schema);
    }
  };
}
