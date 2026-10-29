import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { guardDatabaseUrl } from '../../../scripts/database-guard.ts';
import { assertNode, environment, projectDir, testDatabaseUrl, yarn } from '../../../scripts/env.ts';
import { S3TestStorage } from '../src/testing/s3.ts';

const require = createRequire(import.meta.url);
const apiDir = fileURLToPath(new URL('../', import.meta.url));
const configured = environment();
const useRunningDatabase = process.argv.includes('--use-running-database');
const args = process.argv.slice(2).filter((arg) => arg !== '--use-running-database');
const projects = args.flatMap((arg, index) => {
  if (arg === '--project') return [args[index + 1]];
  if (arg.startsWith('--project=')) return [arg.slice('--project='.length)];
  return [];
});
const unitOnly = projects.length > 0 && projects.every((project) => project === 'unit');
const databaseOnly = projects.length > 0 && projects.every((project) => project === 'database');
const env = {
  ...configured,
  NODE_ENV: 'test',
  ENVIRONMENT: 'test',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
  DATABASE_URL: testDatabaseUrl,
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  SUPERCELL_API_TOKEN: '',
  PUSH_NOTIFICATIONS_ENABLED: 'false',
  EXPO_ACCESS_TOKEN: '',
  ...(unitOnly || databaseOnly
    ? {
        GF_S3_BUCKET: 'unit-signing-only',
        GF_S3_REGION: 'ap-northeast-2',
        GF_S3_ENDPOINT: '',
        GF_S3_KEY_PREFIX: '',
        GF_S3_ACCESS_KEY_ID: 'unit-signing-key',
        GF_S3_SECRET_ACCESS_KEY: 'unit-signing-secret',
      }
    : {}),
};

async function run(script: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: apiDir, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`API test command exited with status ${code}.`)),
    );
  });
}
const storage: { s3?: S3TestStorage } = {};

try {
  assertNode();
  if (!unitOnly && !databaseOnly) {
    Object.assign(process.env, configured);
    const s3 = new S3TestStorage();
    await s3.verifyAccess();
    storage.s3 = s3;
    env.GF_S3_KEY_PREFIX = s3.config.keyPrefix ?? '';
  }
  if (!unitOnly) guardDatabaseUrl(env.DATABASE_URL, { test: true });
  await yarn(['workspace', '@side/toolkit', 'build'], env);
  await yarn(['workspace', '@game-feedback/contracts', 'build'], env);
  await yarn(['workspace', '@game-feedback/api', 'db:generate'], env);
  if (!unitOnly && !useRunningDatabase) await run(join(projectDir, 'scripts/db.ts'), ['start', '--test']);
  const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  await run(cli, ['run', ...args]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API tests failed.');
  process.exitCode = 1;
} finally {
  await storage.s3?.close();
}
