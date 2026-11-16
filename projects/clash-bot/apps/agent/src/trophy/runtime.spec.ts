import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { AdbDevice } from '../adb.ts';
import { DEFAULT_PROFILE } from '../config.ts';
import { runTrophy } from './runtime.ts';

it('stops without a new match and releases its lock when the model owner is gone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clash-trophy-'));
  const abort = new AbortController();
  try {
    const result = await runTrophy({
      dataDir: root,
      device: new AdbDevice('unused', 'unused', abort.signal),
      profile: DEFAULT_PROFILE,
      hours: 1,
      matches: 1,
      signal: abort.signal,
    });
    expect(result.phase).toBe('stopped');
    expect(result.completed).toBe(0);
    const status = JSON.parse(await readFile(join(root, 'trophy/control/status.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(status.stopReason).toBe('model_owner_unavailable');
    expect(status.learning).toBe(false);
    expect(await readdir(join(root, 'trophy/runs'))).toEqual([]);
    await expect(readFile(join(root, 'trophy/control/lock.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
