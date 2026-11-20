import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { DATA_DIR } from '../shared/data-dir.ts';
import { readLockOwner, readRunStatus, requestLearningStop } from '../shared/runtime-lock.ts';
import { superviseUntilStopped } from './run.ts';
import { loopControl } from './state.ts';

const USAGE = 'loop start [--background] [--keep-awake] | status | stop';

// 터미널과 분리해 이 파일을 다시 실행한다. 출력은 loop/control/console.log에 덧붙인다.
async function startInBackground(control: string, keepAwake: boolean) {
  await mkdir(control, { recursive: true, mode: 0o700 });
  const log = join(control, 'console.log');
  const output = openSync(log, 'a', 0o600);
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), 'start', ...(keepAwake ? ['--keep-awake'] : [])],
      { detached: true, stdio: ['ignore', output, output] },
    );
    child.unref();
    return { started: true, pid: child.pid, log };
  } finally {
    closeSync(output);
  }
}

async function main() {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      background: { type: 'boolean', default: false },
      'keep-awake': { type: 'boolean', default: false },
    },
  });
  const command = args.positionals[0] ?? 'status';
  const control = loopControl(DATA_DIR);
  if (command === 'status') {
    const status = await readRunStatus(control).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return { phase: 'not_started', running: false };
      throw error;
    });
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (command === 'stop') {
    const owner = await readLockOwner(control);
    await requestLearningStop(control);
    // 다음 점검까지 기다리지 않도록 신호도 보낸다. 감독은 정지 요청과 같은 순서로 정리한다.
    if (owner) process.kill(owner.pid, 'SIGTERM');
    console.log(JSON.stringify({ stopRequested: true, pid: owner?.pid ?? null }));
    return;
  }
  if (command !== 'start') throw new Error(USAGE);
  if (args.values.background) {
    console.log(JSON.stringify(await startInBackground(control, args.values['keep-awake'])));
    return;
  }
  await superviseUntilStopped(DATA_DIR, { keepAwake: args.values['keep-awake'] });
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
