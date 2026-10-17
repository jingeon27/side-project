import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertNode, environment, projectDir, yarn } from './env.mjs';

const env = environment();
const action = process.argv[2];
const workspace = (name, script, overrides = {}) =>
  yarn(['workspace', `@game-feedback/${name}`, script], { ...env, ...overrides });
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
  await local('db.mjs', ['migrate']);
  await workspace('api', 'db:seed');
}

export async function runTask(task) {
  assertNode();
  if (task === 'setup') await setup();
  else if (task === 'codegen') await prerequisites();
  else if (task === 'check') {
    await prerequisites();
    for (const name of ['contracts', 'api', 'sdk', 'bridge', 'web', 'mobile'])
      await workspace(name, 'typecheck');
    await workspace('web', 'lint');
    await workspace('mobile', 'lint');
  } else if (task === 'test') {
    await prerequisites();
    await workspace('api', 'test', { NODE_ENV: 'test' });
    await workspace('sdk', 'test');
    await workspace('web', 'test');
    await workspace('mobile', 'test');
  } else if (task === 'test:e2e' || task === 'test:mobile:e2e') {
    await prerequisites();
    await local('db.mjs', ['start', '--test']);
    if (task === 'test:e2e') await workspace('web', 'test:e2e');
    await workspace('mobile', 'test:e2e');
  } else if (task === 'build') {
    await prerequisites();
    await workspace('api', 'build', { NODE_ENV: 'production' });
    await workspace('web', 'build', { NODE_ENV: 'production' });
    await workspace('mobile', 'bundle:check');
  } else throw new Error('Usage: tasks.mjs setup|codegen|check|test|test:e2e|test:mobile:e2e|build');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await runTask(action);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
