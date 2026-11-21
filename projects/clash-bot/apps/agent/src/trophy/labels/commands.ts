import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { pythonEnvironment, pythonExecutable } from '../../shared/python.ts';

const MODULE = 'clash_bot.perception.labels.cli';
const run = promisify(execFile);
export const labelCommands = new Set([
  'label',
  'label-status',
  'label-import',
  'label-maintain',
  'card-status',
  'perception-eval',
]);

export async function readLabelResult(dataDir: string, command: string) {
  const { stdout } = await run(pythonExecutable(dataDir), ['-m', MODULE, command], {
    env: pythonEnvironment(dataDir),
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout) as unknown;
}

export async function labelCommand(dataDir: string, args: string[]) {
  const env = pythonEnvironment(dataDir);
  const temp = args[0] === 'label' ? await mkdtemp(join(tmpdir(), 'trophy-review-')) : undefined;
  try {
    if (temp) {
      const code = await readFile(new URL('./workbench.ts', import.meta.url), 'utf8');
      env.CLASH_REVIEW_JS = join(temp, 'review.js');
      await writeFile(env.CLASH_REVIEW_JS, stripTypeScriptTypes(code));
    }
    const child = spawn(pythonExecutable(dataDir), ['-m', MODULE, ...args], { env, stdio: 'inherit' });
    const stop = () => {
      child.kill('SIGTERM');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) =>
          code === 0 || signal === 'SIGTERM'
            ? resolve()
            : reject(new Error('라벨 도구 종료 코드 ' + String(code))),
        );
      });
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
