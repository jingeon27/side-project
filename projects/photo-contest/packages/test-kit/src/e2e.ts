import {
  assertTestSchemaName,
  isolatedSchemaName,
  resolveTestDatabaseUrl,
  schemaUrl,
  type TTestSchemaPrefix,
} from './database';
import { loadProjectEnv } from './env';
import { SERVE_TEST_API_BIN } from './paths';

export interface IE2eDatabase {
  schema: string;
  /** 격리 스키마를 가리키는 URL. 테스트에서 직접 DB를 바꿀 때 쓴다. */
  url: string;
  /** 스키마를 만들고 지울 때 쓰는 테스트 DB URL */
  baseUrl: string;
}

/**
 * Playwright 설정 파일에서 호출한다. 설정은 워커마다 다시 읽히므로 스키마 이름을 환경변수에 고정해
 * 메인 프로세스·워커·webServer가 같은 스키마를 쓰게 한다. 밖에서 넣은 값도 같은 규칙으로 검사한다.
 */
export function prepareE2eDatabase(prefix: TTestSchemaPrefix): IE2eDatabase {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const configured = new URL(baseUrl).searchParams.get('schema');
  const schema =
    configured && configured !== 'public'
      ? assertTestSchemaName(configured, prefix)
      : isolatedSchemaName(prefix);
  const url = schemaUrl(baseUrl, schema);
  process.env.TEST_DATABASE_URL = url;

  return { schema, url, baseUrl };
}

interface IApiWebServerOptions {
  port: number;
  webOrigin: string;
  database: IE2eDatabase;
  /** API에만 더 넘길 루트 환경변수 (예: 비어 있는 관측 키) */
  env?: Record<string, string>;
}

/** 격리 스키마로 API를 띄우는 Playwright webServer 항목. 종료하면 스키마와 실제 S3의 실행별 객체를 지운다. */
export function apiWebServer({ port, webOrigin, database, env = {} }: IApiWebServerOptions) {
  return {
    command: `node ${SERVE_TEST_API_BIN}`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 60_000 },
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    env: {
      SENTRY_DSN: '',
      ...env,
      TEST_DATABASE_URL: database.url,
      API_URL: `http://127.0.0.1:${port}`,
      WEB_ORIGIN: webOrigin,
    },
  };
}
