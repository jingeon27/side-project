import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../config.ts';
import { runCounterpush } from './runner.ts';

it('rejects a second game tab before acquiring the learner lock or launching a model', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'clash-session-'));
  try {
    await expect(
      runCounterpush({
        dataDir,
        tabs: 2,
        profile: DEFAULT_PROFILE,
        model: '3.8-27b',
        hours: 1,
        matches: 2,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('기존 경기를 닫습니다');
    await expect(access(join(dataDir, 'qwen/selfplay/lock.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
