import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { acquireLearningLock, requestLearningStop, stopRequested } from './runtime-lock.ts';

it('prevents competing controllers and addresses graceful stop to the current run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-learning-lock-'));
  try {
    const lock = await acquireLearningLock(directory);
    await expect(acquireLearningLock(directory)).rejects.toThrow('이미 실행 중인 작업');
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

it('applies a stop request only to the run that owned the lock when it was requested', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-learning-stop-'));
  try {
    const lock = await acquireLearningLock(directory);
    await expect(stopRequested(directory, lock.owner.id)).resolves.toBe(false);
    await requestLearningStop(directory);
    await expect(stopRequested(directory, lock.owner.id)).resolves.toBe(true);
    await expect(stopRequested(directory, 'next-run')).resolves.toBe(false);
    await writeFile(join(directory, 'stop.json'), JSON.stringify({ id: lock.owner.id }));
    await expect(stopRequested(directory, lock.owner.id)).rejects.toThrow('stop.json 형식이 맞지 않습니다.');
    await lock.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
