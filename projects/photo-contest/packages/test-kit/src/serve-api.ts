import { execFileSync, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  assertTestDatabaseUrl,
  assertTestSchemaName,
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from './database';
import { loadProjectEnv } from './env';
import { FAKE_S3_DEFAULTS, startFakeS3 } from './fake-s3';
import { API_ROOT, PROJECT_ROOT } from './paths';

/**
 * 격리 스키마와 S3 대역을 만들고 API를 띄운다. SIGTERM/SIGINT를 받으면 API를 멈추고 스키마와 객체 폴더를 지운다.
 * 개발 서버가 보고 있는 dist 대신 .e2e-build로 빌드해 실행 중인 개발 서버를 건드리지 않는다.
 * S3 대역은 빈 포트를 고르고 웹 origin의 브라우저 직접 업로드·조회만 CORS로 허용한다.
 */
async function main() {
  loadProjectEnv();
  const baseUrl = process.env.DATABASE_URL;
  const schema = process.env.PC_E2E_SCHEMA;
  if (!baseUrl || !schema) throw new Error('DATABASE_URL과 PC_E2E_SCHEMA가 필요합니다.');
  assertTestDatabaseUrl(baseUrl);
  assertTestSchemaName(schema);
  const storageDir = resolve(process.env.PC_E2E_STORAGE_DIR ?? resolve(PROJECT_ROOT, '.data', schema));
  // 종료할 때 이 폴더를 통째로 지우므로 프로젝트 .data 아래만 허용한다.
  const fromData = relative(resolve(PROJECT_ROOT, '.data'), storageDir);
  if (!fromData || fromData.startsWith('..') || isAbsolute(fromData))
    throw new Error('PC_E2E_STORAGE_DIR는 projects/photo-contest/.data 아래여야 합니다.');
  const outDir = resolve(API_ROOT, '.e2e-build');
  // API의 빌드 스크립트가 공통 런타임 패키지도 준비하도록 맡긴다.
  if (process.env.PC_E2E_SKIP_API_BUILD !== 'true')
    execFileSync('corepack', ['yarn', 'workspace', '@photo-contest/api', 'build', '--outDir', outDir], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  const url = await createIsolatedDatabase(baseUrl, schema);
  await mkdir(storageDir, { recursive: true });
  const s3 = await startFakeS3({
    ...FAKE_S3_DEFAULTS,
    directory: storageDir,
    corsOrigins: process.env.WEB_ORIGIN ? [new URL(process.env.WEB_ORIGIN).origin] : [],
  });
  const api = spawn(process.execPath, [resolve(outDir, 'main.js')], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ENABLE_DEV_LOGIN: 'false',
      ENABLE_TEST_API: 'true',
      API_HOST: '127.0.0.1',
      DATABASE_URL: url,
      ...s3.env,
    },
  });
  let cleaning: Promise<void> | undefined;
  function cleanup(code: number) {
    cleaning ??= (async () => {
      if (api.exitCode === null) {
        const exited = new Promise((done) => api.once('exit', done));
        api.kill('SIGTERM');
        const timer = setTimeout(() => api.kill('SIGKILL'), 10_000);
        await exited;
        clearTimeout(timer);
      }
      await dropIsolatedDatabase(baseUrl!, schema!);
      await s3.stop();
      await rm(storageDir, { recursive: true, force: true });
      process.exit(code);
    })();
    return cleaning;
  }
  process.on('SIGTERM', () => void cleanup(0));
  process.on('SIGINT', () => void cleanup(0));
  api.on('exit', (code) => void cleanup(code ?? 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
