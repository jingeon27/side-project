import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { once } from 'es-toolkit';

import {
  assertTestSchemaName,
  createIsolatedDatabase,
  dropIsolatedDatabase,
  resolveTestDatabaseUrl,
} from './database';
import { loadProjectEnv } from './env';
import { FAKE_S3_DEFAULTS, startFakeS3 } from './fake-s3';
import { API_ROOT, PROJECT_ROOT } from './paths';

interface IFixtureApp {
  listen(port: number, host: string): Promise<unknown>;
  close(): Promise<void>;
  getHttpAdapter(): { getInstance(): { set(name: string, value: number): unknown } };
}

async function main() {
  loadProjectEnv();
  const baseUrl = resolveTestDatabaseUrl();
  const schema = assertTestSchemaName(new URL(baseUrl).searchParams.get('schema') ?? '');
  const port = Number(new URL(process.env.API_URL ?? '').port);
  if (!Number.isInteger(port) || port < 4300 || port > 4399) throw new Error('Invalid isolated API port.');
  const storageDir = resolve(PROJECT_ROOT, '.data', schema);
  const outDir = resolve(API_ROOT, '.e2e-build');
  execFileSync('yarn', ['workspace', '@photo-contest/api', 'build', '--outDir', outDir], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  const url = await createIsolatedDatabase(baseUrl, schema);
  const state: { app?: IFixtureApp; s3?: Awaited<ReturnType<typeof startFakeS3>> } = {};
  const cleanup = once(async () => {
    try {
      await state.app?.close();
    } finally {
      try {
        await state.s3?.stop();
      } finally {
        try {
          await dropIsolatedDatabase(baseUrl, schema);
        } finally {
          await rm(storageDir, { recursive: true, force: true });
        }
      }
    }
  });
  const stop = () =>
    void cleanup().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await mkdir(storageDir, { recursive: true });
    const s3 = await startFakeS3({
      ...FAKE_S3_DEFAULTS,
      directory: storageDir,
      corsOrigins: process.env.WEB_ORIGIN ? [new URL(process.env.WEB_ORIGIN).origin] : [],
    });
    state.s3 = s3;
    Object.assign(process.env, s3.env, {
      NODE_ENV: 'test',
      DATABASE_URL: url,
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
      PUSH_NOTIFICATIONS_ENABLED: 'false',
      EXPO_ACCESS_TOKEN: '',
    });
    const require = createRequire(import.meta.url);
    const { createApp } = require(resolve(outDir, 'bootstrap.js')) as {
      createApp(options: { logger: false; testFixtures: true; shutdownHooks: false }): Promise<IFixtureApp>;
    };
    // Nest의 신호 재전송보다 스키마·저장소 정리가 먼저 끝나야 한다.
    const app = await createApp({ logger: false, testFixtures: true, shutdownHooks: false });
    state.app = app;
    // 격리 브라우저 레인도 운영과 같은 웹 프록시 한 단계를 거친다.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    await cleanup();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Test API failed.');
  process.exitCode = 1;
});
