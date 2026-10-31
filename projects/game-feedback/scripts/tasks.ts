import { spawn } from 'node:child_process';
import path from 'node:path';

import { match } from 'ts-pattern';

import { assertNode, environment, projectDir, resolveEnvironment, yarn } from './env.ts';

const env = environment();
const action = process.argv[2];
const workspace = (name: string, script: string, overrides: NodeJS.ProcessEnv = {}, args: string[] = []) =>
  yarn(['workspace', `@game-feedback/${name}`, script, ...args], {
    ...env,
    ...overrides,
    ...resolveEnvironment(overrides, env),
  });
function local(script: string, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectDir, 'scripts', script), ...args], {
      cwd: projectDir,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

export async function prerequisites() {
  await workspace('contracts', 'build');
  await workspace('api', 'db:generate');
  await workspace('api', 'openapi');
  await workspace('sdk', 'codegen');
}

export async function setup({ fixtures = false } = {}) {
  await prerequisites();
  await local('db.ts', ['start']);
  await local('db.ts', ['sync']);
  await workspace('api', 'db:seed', {}, fixtures ? ['--fixtures'] : []);
}

async function check() {
  await prerequisites();
  for (const name of ['contracts', 'api', 'sdk', 'bridge', 'web', 'mobile', 'admin'])
    await workspace(name, 'typecheck');
  // API·contracts·sdk·bridge와 프로젝트 스크립트는 프로젝트 루트 eslint.config.ts가 검사한다.
  await yarn(['workspace', '@side/game-feedback', 'lint'], env);
  await workspace('web', 'lint');
  await workspace('mobile', 'lint');
  await workspace('admin', 'lint');
}

async function test({ unitOnly = false } = {}) {
  await prerequisites();
  await workspace('api', unitOnly ? 'test:unit' : 'test', { ENVIRONMENT: 'test' });
  await workspace('sdk', 'test');
  await workspace('bridge', 'test');
  await workspace('web', 'test');
  await workspace('mobile', 'test');
  await workspace('admin', 'test');
}

async function mobileEndToEnd() {
  await prerequisites();
  await local('db.ts', ['start', '--test']);
  await workspace('mobile', 'test:e2e');
}

async function endToEnd() {
  await prerequisites();
  await local('db.ts', ['start', '--test']);
  await workspace('web', 'test:e2e');
  await workspace('web', 'test:test-auth');
  await workspace('web', 'test:prefetch');
  await workspace('admin', 'test:e2e');
  await workspace('mobile', 'test:e2e');
}

async function build() {
  await prerequisites();
  await workspace('api', 'build', { ENVIRONMENT: 'production' });
  await workspace('web', 'build', { ENVIRONMENT: 'production' });
  await workspace('mobile', 'bundle:check');
  await workspace('admin', 'build');
}

export async function runTask(task: string | undefined) {
  assertNode();
  await match(task)
    .with('setup', () => setup())
    .with('codegen', prerequisites)
    .with('check', check)
    .with('test', () => test())
    .with('test:unit', () => test({ unitOnly: true }))
    .with('test:e2e', endToEnd)
    .with('test:mobile:e2e', mobileEndToEnd)
    .with('build', build)
    .otherwise(() => {
      throw new Error('Usage: tasks.ts setup|codegen|check|test|test:unit|test:e2e|test:mobile:e2e|build');
    });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runTask(action);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
