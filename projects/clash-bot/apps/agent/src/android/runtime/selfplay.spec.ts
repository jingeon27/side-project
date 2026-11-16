import { expect, it, vi } from 'vitest';

import { learningLoop } from './selfplay.ts';

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
