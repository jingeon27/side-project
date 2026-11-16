import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { AdbDevice, findAdb, listDevices, selectDevice } from '../adb.ts';
import { DATA_DIR, loadProfile } from '../config.ts';
import { requestLearningStop } from '../selfplay.ts';
import { runTrophy } from './runtime.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    adb: { type: 'string' },
    serial: { type: 'string' },
    profile: { type: 'string' },
    hours: { type: 'string' },
    matches: { type: 'string' },
    background: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});
const main = async () => {
  if (values.help) {
    console.log(
      'trophy [start|status|stop] --background --hours 8 --matches 0 --adb 경로 --serial 127.0.0.1:5555\nCounterpush 실행기의 Qwen을 공유합니다. 경기별 고정 후보로 플레이하며 트로피 결과는 학습·채택 평가에서 제외합니다.',
    );
    return;
  }
  const command = positionals[0] ?? 'start';
  const control = join(DATA_DIR, 'trophy/control');
  if (command === 'status') {
    const status = JSON.parse(await readFile(join(control, 'status.json'), 'utf8')) as {
      pid: number;
      phase: string;
    };
    const running = () => {
      try {
        process.kill(status.pid, 0);
        return !['stopped', 'failed', 'interrupted'].includes(status.phase);
      } catch {
        return false;
      }
    };
    console.log(JSON.stringify({ ...status, running: running() }, null, 2));
    return;
  }
  if (command === 'stop') {
    await requestLearningStop(control);
    console.log('현재 트로피전 종료 후 로비에서 중지합니다.');
    return;
  }
  if (command !== 'start') throw new Error('start, status, stop 중 하나를 사용하세요.');
  const hours = Number(values.hours ?? 8),
    matches = Number(values.matches ?? 0);
  if (
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 24 ||
    !Number.isInteger(matches) ||
    matches < 0 ||
    matches > 10000
  )
    throw new Error('hours는 0~24, matches는 0~10000 정수입니다.');
  await mkdir(control, { recursive: true, mode: 0o700 });
  if (values.background) {
    const output = openSync(join(control, 'console.log'), 'a', 0o600);
    try {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          'start',
          '--hours',
          String(hours),
          '--matches',
          String(matches),
          ...(values.adb ? ['--adb', values.adb] : []),
          ...(values.serial ? ['--serial', values.serial] : []),
          ...(values.profile ? ['--profile', resolve(values.profile)] : []),
        ],
        { detached: true, stdio: ['ignore', output, output], cwd: process.cwd() },
      );
      child.unref();
      console.log(JSON.stringify({ started: true, pid: child.pid, log: join(control, 'console.log') }));
    } finally {
      closeSync(output);
    }
    return;
  }
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  const adb = await findAdb(values.adb);
  await runTrophy({
    dataDir: DATA_DIR,
    device: new AdbDevice(adb, selectDevice(await listDevices(adb), values.serial), abort.signal),
    profile: await loadProfile(resolve(values.profile ?? join(DATA_DIR, 'profile.json'))),
    hours,
    matches,
    signal: abort.signal,
  });
};
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
