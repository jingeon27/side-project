import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { AdbDevice, findAdb, listDevices, selectDevice } from './adb.ts';
import { DATA_DIR, loadProfile } from './config.ts';
import { selectModel } from './model-options.ts';
import { QwenClient } from './qwen-client.ts';
import { runQwen } from './qwen-runner.ts';

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
    model: { type: 'string' },
  },
});
const bounded = (raw: string | undefined, fallback: number, max: number) => {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`값은 1~${max} 정수여야 합니다.`);
  return value;
};
const abort = new AbortController();
const model = selectModel(values.model);
const client = new QwenClient(
  join(DATA_DIR, 'qwen/.venv/bin/python'),
  fileURLToPath(new URL('./qwen/worker.py', import.meta.url)),
  join(DATA_DIR, 'qwen', model.directory),
);
process.once('SIGINT', () => {
  abort.abort();
  client.close();
});
process.once('SIGTERM', () => {
  abort.abort();
  client.close();
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
  client.close();
}
