import { describe, expect, it, vi } from 'vitest';

import { DecisionGate, parallelLearningLoop } from './parallel-loop.ts';

const episode = (tab: number, result = 'loss') => ({
  directory: `/game-${tab}`,
  result,
  actions: 2,
  confirmed: 2,
  seenBattle: true,
});
const deferred = () => {
  const state = { resolve: null as (() => void) | null };
  const promise = new Promise<void>((resolve) => {
    state.resolve = resolve;
  });
  return { promise, resolve: () => state.resolve!() };
};

describe('parallel actors with a shared frozen policy', () => {
  it('starts two matches concurrently, waits for both, then applies one update before the next round', async () => {
    const gates = [deferred(), deferred()];
    const starts: Array<{ tab: number; version: number }> = [];
    const state = { version: 0 };
    const train = vi.fn(async (episodes) => {
      expect(episodes).toHaveLength(state.version === 0 ? 2 : 1);
      state.version++;
      return { updated: true };
    });
    const running = parallelLearningLoop({
      tabs: 2,
      matches: 3,
      until: Date.now() + 10_000,
      signal: new AbortController().signal,
      stopped: async () => false,
      play: async (tab) => {
        const id = starts.length + 1;
        starts.push({ tab, version: state.version });
        if (state.version === 0) await gates[tab]!.promise;
        return episode(id);
      },
      train,
      returnToLobby: async () => {},
      report: async () => {},
    });
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    gates[0]!.resolve();
    await Promise.resolve();
    expect(train).not.toHaveBeenCalled();
    gates[1]!.resolve();
    expect(await running).toEqual({ completed: 3, updates: 2, rounds: 2 });
    expect(starts).toEqual([
      { tab: 0, version: 0 },
      { tab: 1, version: 0 },
      { tab: 0, version: 1 },
    ]);
  });

  it('honors a stop only after both active games and their training finish', async () => {
    const state = { stop: false };
    const train = vi.fn(async (_episodes: ReturnType<typeof episode>[]) => ({ updated: true }));
    const result = await parallelLearningLoop({
      tabs: 2,
      matches: 0,
      until: Date.now() + 10_000,
      signal: new AbortController().signal,
      stopped: async () => state.stop,
      play: async (tab) => {
        state.stop = true;
        return episode(tab);
      },
      train,
      returnToLobby: async () => {},
      report: async () => {},
    });
    expect(result.completed).toBe(2);
    expect(train).toHaveBeenCalledOnce();
    expect(train.mock.calls[0]).toHaveLength(1);
  });

  it('preserves a verified sibling without training unknown results or starting another round', async () => {
    const play = vi.fn(async (tab: number) => episode(tab, tab ? 'unknown' : 'win'));
    const train = vi.fn(async (_episodes: ReturnType<typeof episode>[]) => ({ updated: true }));
    await expect(
      parallelLearningLoop({
        tabs: 2,
        matches: 0,
        until: Date.now() + 10_000,
        signal: new AbortController().signal,
        stopped: async () => false,
        play,
        train,
        returnToLobby: async () => {},
        report: async () => {},
      }),
    ).rejects.toThrow('일부 대전 탭');
    expect(play).toHaveBeenCalledTimes(2);
    expect(train.mock.calls[0]?.[0]).toEqual([episode(0, 'win')]);
  });

  it('takes model turns fairly and releases canceled waiters without blocking later tabs', async () => {
    const gate = new DecisionGate();
    const first = await gate.acquire(new AbortController().signal);
    const canceled = new AbortController();
    const second = gate.acquire(canceled.signal);
    const rejected = expect(second).rejects.toThrow('cancel');
    const third = gate.acquire(new AbortController().signal);
    canceled.abort(new Error('cancel'));
    await rejected;
    first();
    const releaseThird = await third;
    first(); // A duplicate release must not hand out the model twice.
    expect(gate.state.held).toBe(true);
    releaseThird();
    expect(gate.state.held).toBe(false);
  });
});
