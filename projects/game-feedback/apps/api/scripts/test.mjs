import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertNode, environment, projectDir, yarn } from '../../../scripts/env.mjs';
import { guardDatabaseUrl } from '../../../scripts/database-guard.mjs';

const require = createRequire(import.meta.url);
const apiDir = fileURLToPath(new URL('../', import.meta.url));
const configured = environment();
const env = {
  ...configured,
  NODE_ENV: 'test',
  DATABASE_URL: configured.TEST_DATABASE_URL,
  GF_DEMO_MODE: 'false',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
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
  guardDatabaseUrl(env.TEST_DATABASE_URL, { test: true });
  await yarn(['workspace', '@game-feedback/contracts', 'build'], env);
  await yarn(['workspace', '@game-feedback/api', 'db:generate'], env);
  run(join(projectDir, 'scripts/db.mjs'), ['start', '--test']);
  const cli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  run(cli, ['run', ...process.argv.slice(2)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API tests failed.');
  process.exitCode = 1;
}
