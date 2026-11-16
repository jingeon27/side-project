import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { acquireLearningLock, requestLearningStop } from './runtime-lock.ts';

it('prevents competing controllers and addresses graceful stop to the current run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-learning-lock-'));
  try {
    const lock = await acquireLearningLock(directory);
    await expect(acquireLearningLock(directory)).rejects.toThrow('이미 자가학습');
    await requestLearningStop(directory);
    expect(JSON.parse(await readFile(join(directory, 'stop.json'), 'utf8')).id).toBe(lock.owner.id);
    await lock.release();
    const next = await acquireLearningLock(directory);
    expect(next.owner.id).not.toBe(lock.owner.id);
    await next.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
