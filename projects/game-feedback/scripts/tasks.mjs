import { spawn } from 'node:child_process';
import path from 'node:path';

import { assertNode, environment, projectDir, resolveEnvironment, yarn } from './env.mjs';

const env = environment();
const action = process.argv[2];
const workspace = (name, script, overrides = {}) =>
  yarn(['workspace', `@game-feedback/${name}`, script], {
    ...env,
    ...overrides,
    ...resolveEnvironment(overrides, env),
  });
function local(script, args = []) {
  return new Promise((resolve, reject) => {
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

export async function setup() {
  await prerequisites();
  await local('db.mjs', ['start']);
  await local('db.mjs', ['sync']);
  await workspace('api', 'db:seed');
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

async function test() {
  await prerequisites();
  await workspace('api', 'test', { NODE_ENV: 'test' });
  await workspace('sdk', 'test');
  await workspace('bridge', 'test');
  await workspace('web', 'test');
  await workspace('mobile', 'test');
  await workspace('admin', 'test');
}

async function mobileEndToEnd() {
  await prerequisites();
  await local('db.mjs', ['start', '--test']);
  await workspace('mobile', 'test:e2e');
}

async function endToEnd() {
  await prerequisites();
  await local('db.mjs', ['start', '--test']);
  await workspace('web', 'test:e2e');
  await workspace('web', 'test:test-auth');
  await workspace('web', 'test:prefetch');
  await workspace('admin', 'test:e2e');
  await workspace('mobile', 'test:e2e');
}

async function build() {
  await prerequisites();
  await workspace('api', 'build', { NODE_ENV: 'production' });
  await workspace('web', 'build', { NODE_ENV: 'production' });
  await workspace('mobile', 'bundle:check');
  await workspace('admin', 'build');
}

const tasks = {
  setup,
  codegen: prerequisites,
  check,
  test,
  'test:e2e': endToEnd,
  'test:mobile:e2e': mobileEndToEnd,
  build,
};

export async function runTask(task) {
  assertNode();
  if (!Object.hasOwn(tasks, task))
    throw new Error('Usage: tasks.mjs setup|codegen|check|test|test:e2e|test:mobile:e2e|build');
  await tasks[task]();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runTask(action);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
