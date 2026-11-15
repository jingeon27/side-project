import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PROFILE } from './config.ts';
import { decide } from './policy.ts';
import { executeDecision, runBot, updateObservation, type RuntimeState, type Transport } from './runner.ts';
import { fixture } from './testing/fixture.ts';
import { analyze } from './vision.ts';

function runtimeState(): RuntimeState {
  return { actions: 0, lastActionAt: -Infinity, stableFrames: 0, previousHash: null, pending: null };
}

describe('capture → recognize → choose → tap', () => {
  it('runs the complete pipeline with real image buffers and sends two taps to its transport', async () => {
    const first = await fixture({ elixir: 7 });
    const second = await fixture({ elixir: 8 });
    const acknowledged = await fixture({ elixir: 5, hand: ['minipekka', 'archers', 'giant', 'musketeer'] });
    const screenshots = [first.image, second.image, acknowledged.image];
    const device: Transport = {
      screenshot: vi.fn(async () => screenshots.shift() ?? second.image),
      isGameForeground: vi.fn(async () => true),
      tap: vi.fn(async () => {}),
    };
    const summary = await runBot(device, DEFAULT_PROFILE, first.templates, {
      live: true,
      seconds: 3,
      intervalMs: 500,
      maxActions: 1,
      signal: new AbortController().signal,
      log: async () => {},
    });
    expect(summary.frames).toBe(3);
    expect(summary.actions).toBe(1);
    expect(summary.confirmed).toBe(1);
    expect(summary.pending).toBe(false);
    expect(device.tap).toHaveBeenCalledTimes(2);
  });

  it('never sends taps while observing the same pipeline', async () => {
    const first = await fixture({ elixir: 7 });
    const second = await fixture({ elixir: 8 });
    const screenshots = [first.image, second.image];
    const device: Transport = {
      screenshot: async () => screenshots.shift() ?? second.image,
      isGameForeground: async () => true,
      tap: vi.fn(async () => {}),
    };
    const summary = await runBot(device, DEFAULT_PROFILE, first.templates, {
      live: false,
      seconds: 3,
      intervalMs: 500,
      maxActions: 1,
      signal: new AbortController().signal,
      log: async () => {},
    });
    expect(summary.actions).toBe(1);
    expect(device.tap).not.toHaveBeenCalled();
  });

  it('stops the second tap if the game leaves the foreground', async () => {
    const data = await fixture();
    const observation = await analyze(data.image, DEFAULT_PROFILE, data.templates, Date.now());
    const decision = decide(observation, DEFAULT_PROFILE, runtimeState(), Date.now())!;
    const device: Transport = {
      screenshot: async () => data.image,
      isGameForeground: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),
      tap: vi.fn(async () => {}),
    };
    await expect(
      executeDecision(device, decision, observation, DEFAULT_PROFILE, new AbortController().signal),
    ).rejects.toThrow('게임 전환');
    expect(device.tap).toHaveBeenCalledTimes(1);
  });

  it('cancels placement if interrupted after selecting a card', async () => {
    const data = await fixture();
    const observation = await analyze(data.image, DEFAULT_PROFILE, data.templates, Date.now());
    const decision = decide(observation, DEFAULT_PROFILE, runtimeState(), Date.now())!;
    const abort = new AbortController();
    const device: Transport = {
      screenshot: async () => data.image,
      isGameForeground: async () => true,
      tap: vi.fn(async () => {
        abort.abort();
      }),
    };
    await expect(
      executeDecision(device, decision, observation, DEFAULT_PROFILE, abort.signal),
    ).rejects.toThrow();
    expect(device.tap).toHaveBeenCalledTimes(1);
  });

  it('does not select a card from a stale capture', async () => {
    const data = await fixture();
    const observation = await analyze(data.image, DEFAULT_PROFILE, data.templates, 1000);
    const decision = decide(observation, DEFAULT_PROFILE, runtimeState(), 1100)!;
    const device: Transport = {
      screenshot: async () => data.image,
      isGameForeground: async () => true,
      tap: vi.fn(async () => {}),
    };
    await expect(
      executeDecision(
        device,
        decision,
        observation,
        DEFAULT_PROFILE,
        new AbortController().signal,
        () => 3000,
      ),
    ).rejects.toThrow('오래');
    expect(device.tap).not.toHaveBeenCalled();
  });

  it('waits for a changed hand slot and stops if placement was not acknowledged', async () => {
    const data = await fixture();
    const observation = await analyze(data.image, DEFAULT_PROFILE, data.templates, 1000);
    const state = runtimeState();
    state.pending = { card: 'knight', slot: 0, since: 1000 };
    updateObservation(state, observation, 2000);
    expect(state.pending).not.toBeNull();
    expect(() => updateObservation(state, observation, 8000)).toThrow('손패 변경');
    updateObservation(
      state,
      { ...observation, hand: [{ ...observation.hand[0]!, card: 'giant' }, ...observation.hand.slice(1)] },
      2500,
    );
    expect(state.pending).toBeNull();
  });
});
