import type { TestProject } from 'vitest/node';

import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
  isolatedSchemaName,
  loadProjectEnv,
  resolveTestDatabaseUrl,
} from '@photo-contest/test-kit';

/** 파일 저장소를 사용하지 않는 테스트도 운영과 같은 migration으로 격리 스키마를 만든다. */
export default async function setup(project: TestProject) {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = isolatedSchemaName('api_test');
  project.provide('databaseUrl', await createIsolatedDatabase(baseUrl, schema));
  // HTTP 계약 테스트도 저장소를 호출하지 않는다. 개발자의 S3 설정은 하네스가 지운다.
  project.provide('s3Env', {});
  return () => dropIsolatedDatabase(baseUrl, schema);
}
