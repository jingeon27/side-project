import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { selectModel } from '../qwen/model-options.ts';
import { DATA_DIR, loadProfile } from '../shared/config.ts';
import { requestLearningStop } from '../shared/runtime-lock.ts';
import { AdbDevice, findAdb, listDevices, selectDevice } from './device/adb.ts';
import { runSelfPlay } from './runtime/selfplay.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    adb: { type: 'string' },
    serial: { type: 'string' },
    profile: { type: 'string' },
    matches: { type: 'string' },
    hours: { type: 'string' },
    model: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});
const command = positionals[0] ?? 'start';
const main = async () => {
  if (values.help) {
    console.log(
      'selfplay [start|status|stop] --model 3.8-27b --adb 경로 --serial 주소 --matches 0 --hours 8\n기본 Qwen3.8-27B. 0회는 반복 실행, 기본 8시간(최대 24시간). stop은 이번 경기와 학습 후 중지. Ctrl+C는 즉시 중지.',
    );
    return;
  }
  const directory = join(DATA_DIR, 'qwen/selfplay');
  if (command === 'status') {
    const status = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const running = () => {
      if (
        !Number.isInteger(status.pid) ||
        Number(status.pid) < 1 ||
        ['stopped', 'failed', 'interrupted'].includes(String(status.phase))
      )
        return false;
      try {
        process.kill(Number(status.pid), 0);
        return true;
      } catch {
        return false;
      }
    };
    console.log(JSON.stringify({ ...status, running: running() }, null, 2));
    return;
  }
  if (command === 'stop') {
    await requestLearningStop(directory);
    console.log('이번 경기와 학습을 마친 뒤 중지합니다.');
    return;
  }
  if (command !== 'start') throw new Error('start, status, stop 중 하나를 사용하세요.');
  const matches = Number(values.matches ?? 0),
    hours = Number(values.hours ?? 8);
  if (
    !Number.isInteger(matches) ||
    matches < 0 ||
    matches > 10000 ||
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 24
  )
    throw new Error('matches는 0~10000 정수, hours는 0 초과 24 이하여야 합니다.');
  const abort = new AbortController();
  const model = selectModel(values.model, true);
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  const adb = await findAdb(values.adb);
  await runSelfPlay({
    device: new AdbDevice(adb, selectDevice(await listDevices(adb), values.serial), abort.signal),
    profile: await loadProfile(resolve(values.profile ?? join(DATA_DIR, 'profile.json'))),
    dataDir: DATA_DIR,
    matches,
    hours,
    signal: abort.signal,
    model: model.id,
  });
};
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
