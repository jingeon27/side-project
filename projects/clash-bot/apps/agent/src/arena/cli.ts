import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_DIR } from '../shared/data-dir.ts';
import { pythonEnvironment, pythonExecutable } from '../shared/python.ts';

const args = process.argv.slice(2);
const background = args.includes('--background');
const main = async () => {
  if (args[0] === 'study') {
    const { runStudy } = await import('./study.ts');
    return runStudy(DATA_DIR, args.slice(1));
  }
  if (background && args[0] !== 'start') throw new Error('--background는 start에서만 지원합니다.');
  const directory = join(DATA_DIR, 'arena/control');
  if (background) await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = background ? openSync(join(directory, 'console.log'), 'a', 0o600) : null;
  const python = pythonExecutable();
  const inspection = args[0] === 'status' || args[0] === 'stop';
  try {
    const child = spawn(
      inspection && !process.env.CLASH_BOT_PYTHON && !existsSync(python) ? 'python3' : python,
      ['-u', '-m', 'clash_bot.arena.cli', ...args.filter((arg) => arg !== '--background')],
      {
        env: {
          ...pythonEnvironment(),
          OPENBLAS_NUM_THREADS: '1',
          VECLIB_MAXIMUM_THREADS: '1',
          OMP_NUM_THREADS: '1',
        },
        detached: background,
        stdio: output === null ? 'inherit' : ['ignore', output, output],
      },
    );
    child.once('error', (error) => {
      console.error(String(error));
      process.exitCode = 1;
    });
    if (background) {
      child.unref();
      console.log(JSON.stringify({ started: true, pid: child.pid, log: join(directory, 'console.log') }));
      return;
    }
    process.once('SIGINT', () => child.kill('SIGINT'));
    process.once('SIGTERM', () => child.kill('SIGTERM'));
    await new Promise<void>((resolve) =>
      child.once('close', (code) => {
        process.exitCode = code ?? 1;
        resolve();
      }),
    );
  } finally {
    if (output !== null) closeSync(output);
  }
};
await main();
