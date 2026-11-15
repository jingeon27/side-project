import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStudy } from './arena-study.ts';
import { DATA_DIR } from './config.ts';

const args = process.argv.slice(2);
const background = args.includes('--background');
const main = async () => {
  if (args[0] === 'study') return runStudy(DATA_DIR, args.slice(1));
  if (background && args[0] !== 'start') throw new Error('--background는 start에서만 지원합니다.');
  const directory = join(DATA_DIR, 'arena/control');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = background ? openSync(join(directory, 'console.log'), 'a', 0o600) : null;
  try {
    const child = spawn(
      join(DATA_DIR, 'qwen/.venv/bin/python'),
      ['-u', '-m', 'arena.cli', ...args.filter((arg) => arg !== '--background')],
      {
        env: {
          ...process.env,
          PYTHONPATH: [fileURLToPath(new URL('.', import.meta.url)), process.env.PYTHONPATH]
            .filter(Boolean)
            .join(delimiter),
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
    } else {
      process.once('SIGINT', () => child.kill('SIGINT'));
      process.once('SIGTERM', () => child.kill('SIGTERM'));
      await new Promise<void>((resolve) =>
        child.once('exit', (code) => {
          process.exitCode = code ?? 1;
          resolve();
        }),
      );
    }
  } finally {
    if (output !== null) closeSync(output);
  }
};
await main();
