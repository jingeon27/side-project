import { z } from 'zod';

import { CARD_INFO, cardIdSchema, type CardId, type Point } from '../config.ts';

type CycleState = { hand: CardId[]; queue: CardId[] };
const permutations = (cards: CardId[]): CardId[][] =>
  cards.length === 0
    ? [[]]
    : cards.flatMap((card, index) =>
        permutations(cards.filter((_, other) => other !== index)).map((rest) => [card, ...rest]),
      );
const combinations = (cards: CardId[], size: number): CardId[][] =>
  size === 0
    ? [[]]
    : cards.flatMap((card, index) =>
        combinations(cards.slice(index + 1), size - 1).map((rest) => [card, ...rest]),
      );
const uniqueStates = (states: CycleState[]) => [
  ...new Map(
    states.map((state) => [`${state.hand.toSorted().join(',')}|${state.queue.join(',')}`, state]),
  ).values(),
];
const advance = (state: CycleState, card: CardId): CycleState => ({
  hand: [...state.hand.filter((item) => item !== card), state.queue[0]!],
  queue: [...state.queue.slice(1), card],
});

export class CardCycle {
  readonly states: CycleState[];
  readonly flags = { missed: false, resynced: false };
  constructor(readonlyDeck: CardId[], hand?: CardId[], queue?: CardId[]) {
    if (readonlyDeck.length !== 8 || new Set(readonlyDeck).size !== 8)
      throw new Error('카드 순환은 서로 다른 8장으로 구성합니다.');
    const hands = hand ? [hand] : combinations(readonlyDeck, 4);
    this.states = hands.flatMap((initial) =>
      (queue ? [queue] : permutations(readonlyDeck.filter((card) => !initial.includes(card)))).map(
        (pending) => ({ hand: [...initial], queue: [...pending] }),
      ),
    );
    if (
      this.states.some(
        (state) =>
          state.hand.length !== 4 ||
          state.queue.length !== 4 ||
          new Set([...state.hand, ...state.queue]).size !== 8,
      )
    )
      throw new Error('손패 4장과 대기 큐 4장이 필요합니다.');
  }
  play(card: CardId, mayHaveMissed = false) {
    const possible = mayHaveMissed
      ? [0, 1, 2, 3].reduce(
          (states) =>
            uniqueStates([
              ...states,
              ...states.flatMap((state) => state.hand.map((item) => advance(state, item))),
            ]),
          this.states,
        )
      : this.states;
    const next = uniqueStates(
      possible.filter((state) => state.hand.includes(card)).map((state) => advance(state, card)),
    );
    if (!next.length)
      throw new Error('관찰한 카드가 추적 중인 손패에 없습니다. 놓친 행동이나 인식 오류입니다.');
    this.states.splice(0, this.states.length, ...next);
    this.flags.missed ||= mayHaveMissed;
  }
  observeHand(cards: Array<CardId | null>) {
    const known = cards.filter((card): card is CardId => card !== null);
    if (new Set(known).size !== known.length) return false;
    const next = this.states.filter((state) => known.every((card) => state.hand.includes(card)));
    if (!next.length) return false;
    this.states.splice(0, this.states.length, ...next);
    return true;
  }
  snapshot() {
    const cards = [...new Set(this.states.flatMap((state) => [...state.hand, ...state.queue]))];
    return {
      exact: this.states.length === 1 && !this.flags.missed,
      mayHaveMissed: this.flags.missed,
      hypotheses: this.states.length,
      couldHold: cards.filter((card) => this.states.some((state) => state.hand.includes(card))),
      nextDraw: [...new Set(this.states.map((state) => state.queue[0]!))],
      returnsAfterPlays: Object.fromEntries(
        cards.map((card) => {
          const waits = this.states.map((state) =>
            state.hand.includes(card) ? 0 : state.queue.indexOf(card) + 1,
          );
          return [card, { min: Math.min(...waits), max: Math.max(...waits) }];
        }),
      ),
    };
  }
}

const clamp = (amount: number) => Math.max(0, Math.min(10, amount));
export class ElixirLedger {
  readonly samples: Array<{ at: number; amount: number }> = [];
  readonly own: Array<{ at: number; card: CardId }> = [];
  readonly opponent: Array<{ earliest: number; latest: number; card: CardId }> = [];
  observeOwn(at: number, amount: number) {
    this.samples.push({ at, amount: clamp(amount) });
  }
  spendOwn(at: number, card: CardId) {
    this.own.push({ at, card });
  }
  spendOpponent(earliest: number, latest: number, card: CardId) {
    this.opponent.push({ earliest, latest, card });
  }
  snapshot(at: number) {
    const samples = this.samples.filter((sample) => sample.at <= at);
    const first = samples[0];
    if (!first)
      return {
        own: { min: 0, max: 10 },
        opponent: { min: 0, max: 10 },
        ownSpent: 0,
        opponentSeenSpent: 0,
        ownLeakUpper: 0,
        coverage: 'partial' as const,
      };
    const result = samples.slice(1).reduce(
      (state, sample) => {
        const ownSpent = this.own
          .filter((play) => play.at > state.previous.at && play.at <= sample.at)
          .reduce((sum, play) => sum + CARD_INFO[play.card].cost, 0);
        const observableGain = sample.amount - state.previous.amount + ownSpent;
        // At our cap, shared regeneration cannot be reconstructed from the bar.
        // Keep a conservative upper bound, rather than crediting overflow as usable elixir.
        const leakUpper =
          state.leakUpper +
          (sample.amount >= 9.75 || state.previous.amount >= 9.75
            ? Math.max(0, ((sample.at - state.previous.at) / 1000) * (3 / 2.8) - Math.max(0, observableGain))
            : 0);
        const totalOwnSpent = state.ownSpent + ownSpent;
        const sharedUpper = Math.max(
          state.sharedUpper,
          sample.amount + totalOwnSpent + leakUpper - first.amount + 0.2,
        );
        const cost = this.opponent
          .filter((play) => play.earliest + 0.001 > state.previous.at && play.earliest + 0.001 <= sample.at)
          .reduce((sum, play) => sum + CARD_INFO[play.card].cost, 0);
        return {
          previous: sample,
          ownSpent: totalOwnSpent,
          sharedUpper,
          leakUpper,
          enemyUpper: clamp(Math.max(0, state.enemyUpper - cost) + sharedUpper - state.sharedUpper),
        };
      },
      { previous: first, ownSpent: 0, sharedUpper: 0.2, leakUpper: 0, enemyUpper: clamp(first.amount + 0.2) },
    );
    return {
      own: { min: clamp(result.previous.amount - 0.2), max: clamp(result.previous.amount + 0.2) },
      opponent: { min: 0, max: result.enemyUpper },
      ownSpent: result.ownSpent,
      opponentSeenSpent: this.opponent
        .filter((play) => play.latest <= at)
        .reduce((sum, play) => sum + CARD_INFO[play.card].cost, 0),
      ownLeakUpper: result.leakUpper,
      coverage: 'partial' as const,
    };
  }
}

const unitSchema = z.object({
  card: cardIdSchema.nullable(),
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
});
const rangeSchema = z.object({ min: z.number().min(0).max(10), max: z.number().min(0).max(10) });
const cycleSchema = z.object({
  exact: z.boolean(),
  mayHaveMissed: z.boolean(),
  hypotheses: z.int().positive(),
  couldHold: z.array(cardIdSchema),
  nextDraw: z.array(cardIdSchema),
  returnsAfterPlays: z.record(
    z.string(),
    z.object({ min: z.int().min(0).max(4), max: z.int().min(0).max(4) }),
  ),
});
export const battleSituationSchema = z.object({
  at: z.number(),
  visibility: z.literal('partial'),
  own: z.object({
    elixir: rangeSchema,
    hand: z.array(cardIdSchema.nullable()).length(4),
    cycle: cycleSchema.nullable(),
    units: z.array(unitSchema),
    recentPlays: z.array(
      z.object({ card: cardIdSchema, at: z.number(), target: z.object({ x: z.number(), y: z.number() }) }),
    ),
  }),
  opponent: z.object({
    elixir: rangeSchema,
    cycle: cycleSchema,
    units: z.array(unitSchema),
    seenSpent: z.number().nonnegative(),
  }),
  elixirAccounting: z.object({
    ownSpent: z.number(),
    ownLeakUpper: z.number(),
    coverage: z.literal('partial'),
  }),
});
export type BattleSituation = z.infer<typeof battleSituationSchema>;

export class BattleMemory {
  readonly deck: CardId[];
  readonly elixir = new ElixirLedger();
  readonly opponentCycle: CardCycle;
  readonly state = { ownCycle: null as CardCycle | null };
  readonly ownPlays: Array<{ card: CardId; at: number; target: Point }> = [];
  constructor(deck: CardId[]) {
    this.deck = deck;
    this.opponentCycle = new CardCycle(deck);
  }
  ownPlay(card: CardId, at: number, target: Point, hand: Array<CardId | null>) {
    this.elixir.spendOwn(at, card);
    this.ownPlays.push({ card, at, target });
    try {
      this.state.ownCycle?.play(card);
    } catch {
      const known = hand.filter((item): item is CardId => item !== null);
      this.state.ownCycle =
        known.length === 4 && new Set(known).size === 4 ? new CardCycle(this.deck, known) : null;
      if (this.state.ownCycle) this.state.ownCycle.flags.missed = true;
    }
    this.state.ownCycle?.observeHand(hand);
  }
  opponentPlay(card: CardId, earliest: number, latest: number) {
    this.elixir.spendOpponent(earliest, latest, card);
    this.opponentCycle.play(card, true);
  }
  observe(input: {
    at: number;
    amount: number;
    hand: Array<CardId | null>;
    allies: z.infer<typeof unitSchema>[];
    enemies: z.infer<typeof unitSchema>[];
    inputPending: boolean;
  }): BattleSituation {
    this.elixir.observeOwn(input.at, input.amount);
    const known = input.hand.filter((card): card is CardId => card !== null);
    if (!this.state.ownCycle && known.length === 4 && new Set(known).size === 4)
      this.state.ownCycle = new CardCycle(this.deck, known);
    if (!input.inputPending) this.state.ownCycle?.observeHand(input.hand);
    const ledger = this.elixir.snapshot(input.at);
    const ownCycle = this.state.ownCycle?.snapshot() ?? null;
    return {
      at: input.at,
      visibility: 'partial',
      own: {
        elixir: ledger.own,
        hand: input.hand,
        cycle: ownCycle && input.inputPending ? { ...ownCycle, exact: false, mayHaveMissed: true } : ownCycle,
        units: input.allies,
        recentPlays: this.ownPlays.filter((play) => input.at - play.at < 15_000),
      },
      opponent: {
        elixir: input.inputPending ? { min: 0, max: 10 } : ledger.opponent,
        cycle: this.opponentCycle.snapshot(),
        units: input.enemies,
        seenSpent: ledger.opponentSeenSpent,
      },
      elixirAccounting: {
        ownSpent: ledger.ownSpent,
        ownLeakUpper: ledger.ownLeakUpper,
        coverage: ledger.coverage,
      },
    };
  }
}
