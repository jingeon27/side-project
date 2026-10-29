import { execFileSync } from 'node:child_process';
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
import { API_ROOT, PROJECT_ROOT } from './paths';
import { cleanupS3TestObjects, s3TestEnvironment, verifyS3TestAccess } from './s3';

interface IFixtureApp {
  listen(port: number, host: string): Promise<unknown>;
  close(): Promise<void>;
  getHttpAdapter(): { getInstance(): { set(name: string, value: number): unknown } };
}

async function main() {
  try {
    loadProjectEnv();
    const baseUrl = resolveTestDatabaseUrl();
    const schema = assertTestSchemaName(new URL(baseUrl).searchParams.get('schema') ?? '');
    const port = Number(new URL(process.env.API_URL ?? '').port);
    if (!Number.isInteger(port) || port < 4300 || port > 4399) throw new Error('Invalid isolated API port.');
    const s3Env = s3TestEnvironment(process.env, schema);
    await verifyS3TestAccess(s3Env);
    const outDir = resolve(API_ROOT, '.e2e-build');
    execFileSync('yarn', ['workspace', '@photo-contest/api', 'build', '--outDir', outDir], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    const url = await createIsolatedDatabase(baseUrl, schema);
    const state: { app?: IFixtureApp } = {};
    const cleanup = once(async () => {
      try {
        await state.app?.close();
      } finally {
        try {
          await cleanupS3TestObjects(s3Env);
        } finally {
          await dropIsolatedDatabase(baseUrl, schema);
        }
      }
    });
    const stop = async () => {
      try {
        await cleanup();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    try {
      Object.assign(process.env, s3Env, {
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Test API failed.');
    process.exitCode = 1;
  }
}

void main();
