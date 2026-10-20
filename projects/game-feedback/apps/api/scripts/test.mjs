import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertNode, environment, projectDir, yarn } from '../../../scripts/env.mjs';
import { guardDatabaseUrl } from '../../../scripts/database-guard.mjs';

const require = createRequire(import.meta.url);
const apiDir = fileURLToPath(new URL('../', import.meta.url));
const configured = environment();
const args = process.argv.slice(2);
const projects = args.flatMap((arg, index) => {
  if (arg === '--project') return [args[index + 1]];
  if (arg.startsWith('--project=')) return [arg.slice('--project='.length)];
  return [];
});
const unitOnly = projects.length > 0 && projects.every((project) => project === 'unit');
const env = {
  ...configured,
  NODE_ENV: 'test',
  SENTRY_DSN:'',
  NEXT_PUBLIC_SENTRY_DSN:'',
  NEXT_PUBLIC_AMPLITUDE_API_KEY:'',
  DATABASE_URL: configured.TEST_DATABASE_URL,
  GF_DEMO_MODE: 'false',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  X_CLIENT_ID: '',
  X_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  GF_TEST_AUTH_ENABLED: 'false',
  SUPERCELL_API_TOKEN: '',
  GF_ADMIN_GOOGLE_SUB: '',
};

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: apiDir, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`API test command exited with status ${result.status ?? 1}.`);
}

try {
  assertNode();
  if (!unitOnly) guardDatabaseUrl(env.TEST_DATABASE_URL, { test: true });
  await yarn(['workspace', '@game-feedback/contracts', 'build'], env);
  await yarn(['workspace', '@game-feedback/api', 'db:generate'], env);
  if (!unitOnly) run(join(projectDir, 'scripts/db.mjs'), ['start', '--test']);
  const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  run(cli, ['run', ...args]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API tests failed.');
  process.exitCode = 1;
}
