import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { match } from 'ts-pattern';

export const projectDir = fileURLToPath(new URL('../', import.meta.url));
export const rootDir = path.resolve(projectDir, '../..');
export const developmentDatabaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55442/game_feedback?schema=public';
export const testDatabaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=public';

export function resolveEnvironment(...sources: NodeJS.ProcessEnv[]) {
  const value = sources.map((source) => source.ENVIRONMENT).find(Boolean) || 'development';
  return match(value)
    .with('development', 'test', 'production', (mode) => ({ ENVIRONMENT: mode, NODE_ENV: mode }) as const)
    .otherwise(() => {
      throw new Error('ENVIRONMENT must be development, test or production.');
    });
}

export function environment(overrides: NodeJS.ProcessEnv = {}) {
  const envFile = path.join(projectDir, '.env');
  const fileEnv: NodeJS.ProcessEnv = {};
  // Node's parser preserves quoted values without evaluating shell expressions.
  if (existsSync(envFile)) {
    const { parseEnv } = process.getBuiltinModule('node:util');
    Object.assign(fileEnv, parseEnv(readFileSync(envFile, 'utf8')));
  }
  const merged = Object.assign(
    {
      WEB_ORIGIN: 'http://localhost:3300',
      GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4300',
      DATABASE_URL: developmentDatabaseUrl,
    },
    fileEnv,
    process.env,
    overrides,
  );
  return Object.assign(merged, resolveEnvironment(overrides, process.env, fileEnv));
}

export function assertNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Game Feedback requires Node.js 24. Run `nvm use` in projects/game-feedback first.');
  }
}

export function yarn(args: string[], env: NodeJS.ProcessEnv = environment(), options: SpawnOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('yarn', args, {
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
