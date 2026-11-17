import { describe, expect, it } from 'vitest';

import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../deck.ts';
import { BattleMemory } from './battle-state.ts';
import { FieldDynamics } from './field-dynamics.ts';
import { observeFrame, settleOpponent, type FrameReading } from './situation.ts';

const HAND = ['knight', 'furnace', 'poison', 'skeletons'] as const;
const field = new FieldDynamics('situation-spec').observe({ entities: [], allies: [] }, 1_000);
const frame = (at: number, overrides: Partial<FrameReading> = {}): FrameReading => ({
  at,
  hand: [...HAND],
  elixir: { amount: 6.2, range: { min: 5.9, max: 7.1 } },
  elixirConfidence: 0.97,
  inputPending: false,
  field,
  ...overrides,
});

describe('a situation read from one frame', () => {
  it('uses the read bar range only while no input is pending and the bar is reliable', () => {
    const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
    expect(observeFrame(memory, frame(1_000)).own.elixir).toEqual({ min: 5.9, max: 7.1 });
    expect(observeFrame(memory, frame(1_400, { inputPending: true })).own.elixir).toEqual({
      min: 0,
      max: 10,
    });
    const unreliable = observeFrame(memory, frame(1_800, { elixirConfidence: 0.5 }));
    expect(unreliable.own.elixir).toEqual({ min: 0, max: 10 });
    expect(unreliable.opponent.elixir).toEqual({ min: 0, max: 10 });
  });

  it('adds an opponent play seen in this frame without changing earlier stored situations', () => {
    const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
    const earlier = observeFrame(memory, frame(1_000));
    settleOpponent(memory, earlier, frame(1_000));
    const stored = structuredClone(earlier);
    const current = observeFrame(memory, frame(3_000));
    memory.opponentPlay('graveyard', 2_400, 3_000);
    settleOpponent(memory, current, frame(3_000));
    expect(current.opponent.seenSpent).toBeGreaterThan(earlier.opponent.seenSpent);
    expect(current.opponent.cycle).not.toEqual(earlier.opponent.cycle);
    expect(earlier).toEqual(stored);
  });
});
