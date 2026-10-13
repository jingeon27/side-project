import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { assertLocalDatabase, isolatedSchemaName, schemaUrl } from './database';
import { loadProjectEnv } from './env';
import { PROJECT_ROOT, SERVE_TEST_API_BIN } from './paths';

interface IStartIsolatedApiOptions {
  port: number;
  webOrigin: string;
  /** 격리 스키마 이름 앞부분. 소문자·숫자·_만 쓴다. */
  prefix: string;
  /** API에만 더 넘길 환경변수 (예: 가짜 OAuth client id) */
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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

/** vitest globalSetup에서 쓴다. 격리 스키마로 API를 띄우고 stop()에서 스키마와 사진 폴더까지 지운다. */
export async function startIsolatedApi({
  port,
  webOrigin,
  prefix,
  env = {},
}: IStartIsolatedApiOptions): Promise<IIsolatedApi> {
  loadProjectEnv();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL이 필요합니다. projects/photo-contest/.env를 확인하세요.');
  assertLocalDatabase(baseUrl);
  const schema = isolatedSchemaName(prefix);
  const child = spawn(process.execPath, [SERVE_TEST_API_BIN], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
      DATABASE_URL: baseUrl,
      PC_E2E_SCHEMA: schema,
      PORT: String(port),
      WEB_ORIGIN: webOrigin,
      STORAGE_DIR: resolve(PROJECT_ROOT, '.data', schema),
    },
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = () =>
    new Promise<void>((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      child.once('exit', () => done());
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
