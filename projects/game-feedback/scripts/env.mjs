import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectDir = fileURLToPath(new URL('../', import.meta.url));
export const rootDir = path.resolve(projectDir, '../..');
export const developmentDatabaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55442/game_feedback?schema=public';
export const testDatabaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=public';

export function resolveEnvironment(...sources) {
  const value = sources.map((source) => source.ENVIRONMENT || source.NODE_ENV).find(Boolean) || 'development';
  if (!['development', 'test', 'production'].includes(value))
    throw new Error('ENVIRONMENT must be development, test or production.');
  return { ENVIRONMENT: value, NODE_ENV: value };
}

export function environment(overrides = {}) {
  const envFile = path.join(projectDir, '.env');
  const fileEnv = {};
  // Node's parser preserves quoted values without evaluating shell expressions.
  if (existsSync(envFile)) {
    const { parseEnv } = process.getBuiltinModule('node:util');
    Object.assign(fileEnv, parseEnv(readFileSync(envFile, 'utf8')));
  }
  const merged = {
    PORT: '4300',
    WEB_ORIGIN: 'http://localhost:3300',
    API_ORIGIN: 'http://localhost:4300',
    GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4300',
    DATABASE_URL: developmentDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    GF_DEMO_MODE: 'false',
    ...fileEnv,
    ...process.env,
    ...overrides,
    ...resolveEnvironment(overrides, process.env, fileEnv),
  };
  if (!merged.GF_S3_BUCKET)
    Object.assign(merged, {
      GF_S3_BUCKET: 'game-feedback-dev',
      GF_S3_REGION: 'us-east-1',
      GF_S3_ENDPOINT: 'http://127.0.0.1:4310',
      GF_S3_FORCE_PATH_STYLE: 'true',
      GF_S3_ACCESS_KEY_ID: 'local-test-access-key',
      GF_S3_SECRET_ACCESS_KEY: 'local-test-secret-key',
    });
  return merged;
}

export function assertNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Game Feedback requires Node.js 24. Run `nvm use` in projects/game-feedback first.');
  }
}

export function yarn(args, env = environment(), options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('corepack', ['yarn', ...args], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`yarn ${args.join(' ')} exited ${signal ?? code}`)),
    );
  });
}
