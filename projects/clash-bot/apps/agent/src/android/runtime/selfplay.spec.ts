import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { acquireLearningLock, learningLoop, requestLearningStop } from './selfplay.ts';

it('applies a weight update before starting the next match', async () => {
  const calls: string[] = [];
  const state = await learningLoop({
    matches: 2,
    until: Date.now() + 10_000,
    signal: new AbortController().signal,
    stopped: async () => false,
    play: async () => {
      calls.push('play');
      return { directory: '/game', result: 'loss', actions: 3, confirmed: 2, seenBattle: true };
    },
    train: async () => {
      calls.push('train');
      return { updated: true, version: 1 };
    },
    returnToLobby: async () => {
      calls.push('lobby');
    },
    report: async () => {},
  });
  expect(calls).toEqual(['play', 'train', 'lobby', 'play', 'train', 'lobby']);
  expect(state).toEqual({ completed: 2, updates: 2 });
});

it('finishes the active game and training before honoring a graceful stop', async () => {
  const state = { stop: false };
  const play = vi.fn(async () => {
    state.stop = true;
    return { directory: '/game', result: 'win', actions: 3, confirmed: 2, seenBattle: true };
  });
  const train = vi.fn(async () => ({ updated: true }));
  const result = await learningLoop({
    matches: 0,
    until: Date.now() + 10_000,
    signal: new AbortController().signal,
    stopped: async () => state.stop,
    play,
    train,
    returnToLobby: async () => {},
    report: async () => {},
  });
  expect(result.completed).toBe(1);
  expect(train).toHaveBeenCalledTimes(1);
});

it('does not train or start another game when the result is unverified', async () => {
  const train = vi.fn();
  await expect(
    learningLoop({
      matches: 2,
      until: Date.now() + 10_000,
      signal: new AbortController().signal,
      stopped: async () => false,
      play: async () => ({
        directory: '/game',
        result: 'unknown',
        actions: 3,
        confirmed: 2,
        seenBattle: true,
      }),
      train,
      returnToLobby: async () => {},
      report: async () => {},
    }),
  ).rejects.toThrow('경기 결과');
  expect(train).not.toHaveBeenCalled();
});

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
