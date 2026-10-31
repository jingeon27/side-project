import { spawn } from 'node:child_process';

import dayjs from 'dayjs';

import { isolatedSchemaName, resolveTestDatabaseUrl, schemaUrl, type TTestSchemaPrefix } from './database';
import { loadProjectEnv } from './env';
import { SERVE_TEST_API_BIN } from './paths';

interface IStartIsolatedApiOptions {
  port: number;
  webOrigin: string;
  /** 격리 스키마 이름 앞부분(TEST_SCHEMA_PREFIXES) */
  prefix: TTestSchemaPrefix;
  /** API에만 더 넘길 환경변수 */
  env?: Record<string, string>;
}

export interface IIsolatedApi {
  /** 예: http://127.0.0.1:4321 */
  url: string;
  /** 테스트에서 DB 상태를 직접 준비할 때 쓰는 격리 스키마 URL */
  databaseUrl: string;
  stop: () => Promise<void>;
}

async function waitForHealth(url: string, isAlive: () => boolean, timeoutMs: number) {
  const deadline = dayjs().valueOf() + timeoutMs;
  while (dayjs().valueOf() < deadline) {
    if (!isAlive()) throw new Error('격리 API가 시작하기 전에 종료됐습니다.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 아직 포트를 열지 않았다.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`격리 API가 ${timeoutMs / 1000}초 안에 준비되지 않았습니다.`);
}

/** vitest globalSetup에서 쓴다. 격리 스키마로 API를 띄우고 stop()에서 스키마와 실제 S3의 실행별 객체를 지운다. */
export async function startIsolatedApi({
  port,
  webOrigin,
  prefix,
  env = {},
}: IStartIsolatedApiOptions): Promise<IIsolatedApi> {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = isolatedSchemaName(prefix);
  const child = spawn(process.execPath, [SERVE_TEST_API_BIN], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SENTRY_DSN: '',
      ...env,
      TEST_DATABASE_URL: schemaUrl(baseUrl, schema),
      API_URL: `http://127.0.0.1:${port}`,
      WEB_ORIGIN: webOrigin,
    },
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = () =>
    new Promise<void>((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      child.once('exit', done);
      child.kill('SIGTERM');
    });
  try {
    await waitForHealth(`${url}/health`, () => child.exitCode === null, 180_000);
  } catch (error) {
    await stop();
    throw error;
  }
  return { url, databaseUrl: schemaUrl(baseUrl, schema), stop };
}
