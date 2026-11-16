import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { MODEL } from '../qwen/model.ts';
import { DATA_DIR, loadProfile } from '../shared/config.ts';
import { JsonLineClient } from '../shared/json-lines-client.ts';
import { pythonExecutable } from '../shared/python.ts';
import { AdbDevice, findAdb, listDevices, selectDevice } from './device/adb.ts';
import { runQwen } from './runtime/qwen-runner.ts';

const { values } = parseArgs({
  options: {
    live: { type: 'boolean' },
    'start-match': { type: 'boolean' },
    serial: { type: 'string' },
    adb: { type: 'string' },
    profile: { type: 'string' },
    seconds: { type: 'string' },
    image: { type: 'string' },
    'max-actions': { type: 'string' },
  },
});
const bounded = (raw: string | undefined, fallback: number, max: number) => {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`값은 1~${max} 정수여야 합니다.`);
  return value;
};
const abort = new AbortController();
const client = new JsonLineClient(
  pythonExecutable(),
  ['-m', 'clash_bot.qwen.worker'],
  join(DATA_DIR, 'qwen', MODEL.directory),
);
process.once('SIGINT', () => {
  abort.abort();
  void client.close();
});
process.once('SIGTERM', () => {
  abort.abort();
  void client.close();
});
try {
  const adb = await findAdb(values.adb);
  await runQwen({
    device: new AdbDevice(adb, selectDevice(await listDevices(adb), values.serial), abort.signal),
    client,
    profile: await loadProfile(resolve(values.profile ?? join(DATA_DIR, 'profile.json'))),
    dataDir: DATA_DIR,
    live: values.live ?? false,
    startMatch: values['start-match'] ?? false,
    seconds: bounded(values.seconds, 240, 600),
    maxActions: bounded(values['max-actions'], 80, 200),
    signal: abort.signal,
    ...(values.image ? { image: resolve(values.image) } : {}),
  });
} catch (error) {
  if (!abort.signal.aborted) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
