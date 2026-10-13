import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createIsolatedDatabase, dropIsolatedDatabase } from './database';
import { loadProjectEnv } from './env';
import { API_ROOT, PROJECT_ROOT, TSC } from './paths';

/**
 * 격리 스키마를 만들고 API를 띄운다. SIGTERM/SIGINT를 받으면 API를 멈추고 스키마와 사진 폴더를 지운다.
 * 개발 서버가 보고 있는 dist 대신 .e2e-build로 빌드해 실행 중인 개발 서버를 건드리지 않는다.
 */
async function main() {
  loadProjectEnv();
  const baseUrl = process.env.DATABASE_URL;
  const schema = process.env.PC_E2E_SCHEMA;
  if (!baseUrl || !schema) throw new Error('DATABASE_URL과 PC_E2E_SCHEMA가 필요합니다.');
  const storageDir = process.env.STORAGE_DIR ?? resolve(PROJECT_ROOT, '.data', schema);
  const outDir = resolve(API_ROOT, '.e2e-build');
  const buildConfig = existsSync(resolve(API_ROOT, 'tsconfig.build.json'))
    ? 'tsconfig.build.json'
    : 'tsconfig.json';
  if (process.env.PC_E2E_SKIP_API_BUILD !== 'true')
    execFileSync(process.execPath, [TSC, '-p', resolve(API_ROOT, buildConfig), '--outDir', outDir], {
      stdio: 'inherit',
    });
  const url = await createIsolatedDatabase(baseUrl, schema);
  await mkdir(storageDir, { recursive: true });
  const api = spawn(process.execPath, [resolve(outDir, 'main.js')], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ENABLE_DEV_LOGIN: 'true',
      API_HOST: '127.0.0.1',
      DATABASE_URL: url,
      STORAGE_BACKEND: 'local',
      STORAGE_DIR: storageDir,
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
