import { z } from 'zod';

import { cardIdSchema, type CardId } from '../cards.ts';
import type { Point } from '../geometry.ts';
import { UNIT_KINDS } from '../knowledge.ts';
import { CardCycle } from './card-cycle.ts';
import { ElixirLedger } from './elixir-ledger.ts';
import {
  abilitySchema,
  EvolutionCycles,
  evolutionSchema,
  type EvolutionDeck,
  type HeroAbility,
} from './special-state.ts';

export const healthSchema = z
  .object({
    minFraction: z.number().min(0).max(1),
    maxFraction: z.number().min(0).max(1),
    source: z.literal('visible_hp_bar'),
  })
  .refine((value) => value.minFraction <= value.maxFraction, 'HP fraction interval is reversed');
const unitSchema = z.object({
  card: cardIdSchema.nullable(),
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
  kind: z.enum(UNIT_KINDS).optional(),
  variant: z.enum(['base', 'evolution', 'hero', 'unknown']).optional(),
  trackId: z.string().optional(),
  health: healthSchema.optional(),
  motion: z.object({ samples: z.int().nonnegative(), elapsedMs: z.number().nonnegative() }).optional(),
  velocity: z
    .object({ xPerSecond: z.number(), yPerSecond: z.number(), speedPixelsPerSecond: z.number() })
    .optional(),
  sourceCard: cardIdSchema.optional(),
  possibleParent: z.string().nullable().optional(),
});
export type FieldUnit = z.infer<typeof unitSchema>;
const effectSchema = z.object({
  card: z.enum(['graveyard', 'poison']),
  side: z.enum(['red', 'blue']),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
  confidence: z.number().min(0).max(1),
  visibleAgeMs: z.number().nonnegative(),
  onsetCertain: z.boolean(),
  source: z.enum(['visual', 'confirmed_input_estimate']),
  predictions: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        inMs: z.number(),
        supportingCasts: z.number(),
        uncertaintyPx: z.number(),
        source: z.literal('empirical_first_visibility'),
      }),
    )
    .optional(),
});
export type FieldEffect = z.infer<typeof effectSchema>;
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
  effects: z.array(effectSchema).optional(),
  spawners: z
    .array(
      z.object({
        trackId: z.string(),
        card: cardIdSchema,
        side: z.enum(['red', 'blue']),
        observedChildren: z.number(),
        lastChildSeenAgoMs: z.number().nullable(),
      }),
    )
    .optional(),
  own: z.object({
    elixir: rangeSchema,
    hand: z.array(cardIdSchema.nullable()).length(4),
    cycle: cycleSchema.nullable(),
    evolutions: z.array(evolutionSchema).optional(),
    ability: abilitySchema.optional(),
    recentAbilities: z
      .array(
        z.object({
          card: z.literal('ice_wizard'),
          cost: z.literal(2),
          at: z.number(),
          instance: z.int().positive(),
        }),
      )
      .optional(),
    units: z.array(unitSchema),
    recentPlays: z.array(
      z.object({ card: cardIdSchema, at: z.number(), target: z.object({ x: z.number(), y: z.number() }) }),
    ),
  }),
  opponent: z.object({
    elixir: rangeSchema,
    cycle: cycleSchema,
    evolutions: z.array(evolutionSchema).optional(),
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
  readonly ownAbilities: Array<{ card: 'ice_wizard'; cost: 2; at: number; instance: number }> = [];
  readonly ownEvolutions: EvolutionCycles;
  readonly opponentEvolutions: EvolutionCycles;
  constructor(deck: CardId[], evolutions: EvolutionDeck = {}) {
    this.deck = deck;
    this.opponentCycle = new CardCycle(deck);
    this.ownEvolutions = new EvolutionCycles(evolutions);
    this.opponentEvolutions = new EvolutionCycles(evolutions);
    this.opponentEvolutions.uncertain();
  }
  ownPlay(card: CardId, at: number, target: Point, hand: Array<CardId | null>) {
    this.elixir.spendOwn(at, card);
    this.ownEvolutions.play(card);
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
  ownAbility(at: number, instance: number) {
    if (instance <= 0 || this.ownAbilities.some((entry) => entry.instance === instance)) return false;
    this.elixir.spendOwnAbility(at);
    this.ownAbilities.push({ card: 'ice_wizard', cost: 2, at, instance });
    return true;
  }
  opponentPlay(card: CardId, earliest: number, latest: number) {
    this.elixir.spendOpponent(earliest, latest, card);
    this.opponentCycle.play(card, true);
    // Missed enemy plays may include other evolution charges. Preserve every
    // phase instead of presenting an exact enemy evolution counter.
    this.opponentEvolutions.uncertain();
    this.opponentEvolutions.play(card);
  }
  observe(input: {
    at: number;
    amount: number;
    hand: Array<CardId | null>;
    allies: z.infer<typeof unitSchema>[];
    enemies: z.infer<typeof unitSchema>[];
    inputPending: boolean;
    elixirReliable?: boolean;
    elixirRange?: { min: number; max: number };
    effects?: FieldEffect[];
    spawners?: BattleSituation['spawners'];
    ability?: HeroAbility;
  }): BattleSituation {
    // The spend animation briefly hides the bar. Those pixels are not a new
    // resource balance and must not inflate the shared-regeneration estimate.
    if (!input.inputPending && input.elixirReliable !== false)
      this.elixir.observeOwn(input.at, input.amount, input.elixirRange);
    const known = input.hand.filter((card): card is CardId => card !== null);
    if (!this.state.ownCycle && known.length === 4 && new Set(known).size === 4)
      this.state.ownCycle = new CardCycle(this.deck, known);
    if (!input.inputPending) this.state.ownCycle?.observeHand(input.hand);
    const ledger = this.elixir.snapshot(input.at);
    const ownCycle = this.state.ownCycle?.snapshot() ?? null;
    return {
      at: input.at,
      visibility: 'partial',
      effects: input.effects ?? [],
      spawners: input.spawners ?? [],
      own: {
        elixir: input.inputPending || input.elixirReliable === false ? { min: 0, max: 10 } : ledger.own,
        hand: input.hand,
        cycle: ownCycle && input.inputPending ? { ...ownCycle, exact: false, mayHaveMissed: true } : ownCycle,
        evolutions: this.ownEvolutions.snapshot(),
        ...(input.ability ? { ability: input.ability } : {}),
        recentAbilities: this.ownAbilities.filter((entry) => input.at - entry.at < 15_000),
        units: input.allies,
        recentPlays: this.ownPlays.filter((play) => input.at - play.at < 15_000),
      },
      opponent: {
        elixir: input.inputPending || input.elixirReliable === false ? { min: 0, max: 10 } : ledger.opponent,
        cycle: this.opponentCycle.snapshot(),
        evolutions: this.opponentEvolutions.snapshot(),
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
