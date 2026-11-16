import { describe, expect, it } from 'vitest';

import type { CardId } from '../../shared/config.ts';
import { BattleMemory, CardCycle, ElixirLedger } from './battle-state.ts';

const hand: CardId[] = ['knight', 'furnace', 'ice_wizard', 'graveyard'];
const queue: CardId[] = ['skeletons', 'poison', 'goblin_hut', 'barbarian_barrel'];
const deck = [...hand, ...queue];

describe('four-card FIFO cycle', () => {
  it('keeps a played card out of hand until four subsequent draws', () => {
    const cycle = new CardCycle(deck, hand, queue);
    cycle.play('knight');
    expect(cycle.snapshot().returnsAfterPlays.knight).toEqual({ min: 4, max: 4 });
    expect(() => cycle.play('knight')).toThrow('손패');
    for (const card of ['furnace', 'ice_wizard', 'graveyard'] as const) cycle.play(card);
    expect(cycle.snapshot().returnsAfterPlays.knight).toEqual({ min: 1, max: 1 });
    cycle.play('skeletons');
    expect(cycle.snapshot().returnsAfterPlays.knight).toEqual({ min: 0, max: 0 });
    expect(cycle.snapshot().couldHold).toContain('knight');
  });
  it('infers an unknown queue from observed draws and widens missed opponent actions', () => {
    const own = new CardCycle(deck, hand);
    expect(own.snapshot().hypotheses).toBe(24);
    own.play('knight');
    expect(own.observeHand(['furnace', 'ice_wizard', 'graveyard', 'skeletons'])).toBe(true);
    expect(own.snapshot().hypotheses).toBe(6);
    const opponent = new CardCycle(deck);
    expect(opponent.snapshot().hypotheses).toBe(1680);
    opponent.play('knight');
    expect(() => opponent.play('knight')).toThrow();
    expect(() => opponent.play('knight', true)).not.toThrow();
    expect(opponent.snapshot().mayHaveMissed).toBe(true);
    expect(opponent.snapshot().exact).toBe(false);
  });
});

describe('shared regeneration and capped elixir', () => {
  it('adds back our own costs and subtracts observed enemy costs', () => {
    const ledger = new ElixirLedger();
    ledger.observeOwn(1000, 5);
    ledger.spendOwn(1200, 'knight');
    ledger.observeOwn(2000, 2.4);
    expect(ledger.snapshot(2000).opponent.max).toBeCloseTo(5.6);
    ledger.spendOpponent(2000, 2100, 'furnace');
    ledger.observeOwn(3000, 2.8);
    expect(ledger.snapshot(3000).opponent.max).toBeCloseTo(2);
    expect(ledger.snapshot(3000).ownSpent).toBe(3);
  });
  it('does not bank overflow at ten and preserves uncertainty for missed plays', () => {
    const ledger = new ElixirLedger();
    ledger.observeOwn(1000, 9.9);
    ledger.observeOwn(100000, 10);
    expect(ledger.snapshot(100000).opponent).toEqual({ min: 0, max: 10 });
    ledger.spendOpponent(100000, 100050, 'furnace');
    ledger.observeOwn(100100, 10);
    const estimate = ledger.snapshot(100100);
    expect(estimate.opponent.max).toBeGreaterThan(6);
    expect(estimate.opponent.max).toBeLessThan(6.2);
    expect(estimate.ownLeakUpper).toBeGreaterThan(90);
    expect(estimate.coverage).toBe('partial');
  });
  it('does not leak later plays or resource updates into an earlier saved situation', () => {
    const memory = new BattleMemory(deck);
    const before = memory.observe({
      at: 1000,
      amount: 5,
      hand,
      allies: [],
      enemies: [],
      inputPending: false,
    });
    memory.opponentPlay('furnace', 1100, 1500);
    memory.ownPlay('knight', 1600, { x: 95, y: 420 }, ['skeletons', 'furnace', 'ice_wizard', 'graveyard']);
    expect(before.opponent.seenSpent).toBe(0);
    expect(before.own.recentPlays).toEqual([]);
    expect(before.own.cycle?.returnsAfterPlays.knight?.min).toBe(0);
  });
  it('ignores the temporarily dark bar during input and preserves quantized uncertainty', () => {
    const memory = new BattleMemory(deck);
    const input = { hand, allies: [], enemies: [] };
    memory.observe({
      ...input,
      at: 1000,
      amount: 8,
      elixirRange: { min: 7.9, max: 9.1 },
      inputPending: false,
    });
    const pending = memory.observe({ ...input, at: 1500, amount: 0, inputPending: true });
    expect(pending.own.elixir).toEqual({ min: 0, max: 10 });
    expect(pending.opponent.elixir).toEqual({ min: 0, max: 10 });
    expect(memory.elixir.samples).toHaveLength(1);
    memory.ownPlay('skeletons', 1200, { x: 95, y: 420 }, hand);
    const settled = memory.observe({
      ...input,
      at: 2000,
      amount: 7,
      elixirRange: { min: 6.9, max: 8.1 },
      inputPending: false,
    });
    expect(settled.own.elixir).toEqual({ min: 6.9, max: 8.1 });
    expect(settled.elixirAccounting.ownSpent).toBe(1);
    expect(memory.elixir.samples).toHaveLength(2);
  });
});
