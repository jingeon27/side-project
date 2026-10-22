import { resolve } from 'node:path';

import { isolatedSchemaName, resolveTestDatabaseUrl, schemaUrl } from './database';
import { loadProjectEnv } from './env';
import { PROJECT_ROOT, SERVE_TEST_API_BIN } from './paths';

export interface IE2eDatabase {
  schema: string;
  /** 격리 스키마를 가리키는 URL. 테스트에서 직접 DB를 바꿀 때 쓴다. */
  url: string;
  /** 스키마를 만들고 지울 때 쓰는 개발 DB URL */
  baseUrl: string;
  storageDir: string;
}

/**
 * Playwright 설정 파일에서 호출한다. 설정은 워커마다 다시 읽히므로 스키마 이름을 환경변수에 고정해
 * 메인 프로세스·워커·webServer가 같은 스키마를 쓰게 한다.
 */
export function prepareE2eDatabase(prefix: string): IE2eDatabase {
  loadProjectEnv();
  const baseUrl = process.env.PC_E2E_BASE_DATABASE_URL ?? resolveTestDatabaseUrl();
  process.env.PC_E2E_BASE_DATABASE_URL = baseUrl;
  process.env.PC_E2E_SCHEMA ??= isolatedSchemaName(prefix);
  const schema = process.env.PC_E2E_SCHEMA;
  const url = schemaUrl(baseUrl, schema);
  process.env.PC_E2E_DATABASE_URL = url;
  return { schema, url, baseUrl, storageDir: resolve(PROJECT_ROOT, '.data', schema) };
}

interface IApiWebServerOptions {
  port: number;
  webOrigin: string;
  database: IE2eDatabase;
  /** API에만 더 넘길 환경변수 (예: 가짜 OAuth client id) */
  env?: Record<string, string>;
}

/** 격리 스키마로 API를 띄우는 Playwright webServer 항목. 종료하면 스키마와 S3 대역 폴더를 지운다. */
export function apiWebServer({ port, webOrigin, database, env = {} }: IApiWebServerOptions) {
  return {
    command: `node ${SERVE_TEST_API_BIN}`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 20_000 },
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    env: {
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      KAKAO_CLIENT_ID: '',
      KAKAO_CLIENT_SECRET: '',
      SENTRY_DSN: '',
      ...env,
      DATABASE_URL: database.baseUrl,
      PC_E2E_SCHEMA: database.schema,
      PORT: String(port),
      WEB_ORIGIN: webOrigin,
      PC_E2E_STORAGE_DIR: database.storageDir,
    },
  };
}
