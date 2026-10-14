import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
  isolatedSchemaName,
  loadProjectEnv,
  PROJECT_ROOT,
  resolveTestDatabaseUrl,
} from '@photo-contest/test-kit';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** 이번 실행 전용 격리 스키마를 가리키는 DATABASE_URL */
    databaseUrl: string;
    /** 이번 실행 전용 사진 폴더. 끝나면 지운다. */
    storageDir: string;
  }
}

/**
 * api 레인 전체가 격리 스키마 하나를 함께 쓴다. 테스트 전용 DB(TEST_DATABASE_URL)가 있으면 그곳에,
 * 없으면 로컬 개발 DB에 만든다. 어느 쪽이든 public 스키마는 건드리지 않는다.
 */
export default async function setup(project: TestProject) {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = isolatedSchemaName('api_test');
  const storageDir = resolve(PROJECT_ROOT, '.data', schema);
  const databaseUrl = await createIsolatedDatabase(baseUrl, schema);
  project.provide('databaseUrl', databaseUrl);
  project.provide('storageDir', storageDir);
  return async function teardown() {
    await dropIsolatedDatabase(baseUrl, schema);
    await rm(storageDir, { recursive: true, force: true });
  };
}
