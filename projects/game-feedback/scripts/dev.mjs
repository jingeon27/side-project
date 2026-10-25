import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

import { assertNode, environment, rootDir } from './env.mjs';
import { startLocalS3 } from './local-s3.mjs';

const demo = process.argv.includes('--demo');
const testAuth = process.argv.includes('--test-auth');
const env = environment();
const children = new Set();
let stopping = false;
let localS3;

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop that service or use a separate worktree port configuration.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    // Each child has its own process group; this never targets another session.
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  void localS3?.close();
  process.exitCode = code;
}

function launch(name) {
  const child = spawn(
    'corepack',
    ['yarn', 'workspace', `@game-feedback/${name}`, 'dev', ...(name === 'api' ? process.argv.slice(2) : [])],
    {
      cwd: rootDir,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    },
  );
  children.add(child);
  child.once('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

try {
  assertNode();
  if (env.ENVIRONMENT === 'production') throw new Error('The development runner cannot run in production.');
  await Promise.all([assertPortFree(3300), assertPortFree(4300)]);
  // Propagate explicit demo mode before importing setup's environment snapshot.
  const { setup } = await import('./tasks.mjs');
  localS3 = await startLocalS3(env);
  await setup({ fixtures: demo || testAuth });
  if (!stopping) {
    console.log(`Game Feedback ${demo ? 'explicit local demo' : 'development'}: http://localhost:3300/ko`);
    launch('api');
    launch('web');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop(1);
}
