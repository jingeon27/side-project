import { z } from 'zod';

import type { CardId } from '../../shared/config.ts';

export const evolutionSchema = z.object({
  card: z.enum(['knight', 'furnace']),
  cycles: z.int().positive(),
  normalPlaysBeforeEvolved: z.object({ min: z.int().nonnegative(), max: z.int().nonnegative() }),
  nextDeploy: z.enum(['base', 'evolution', 'unknown']),
  counterExact: z.boolean(),
  basis: z.literal('configured_deck_and_confirmed_card_plays'),
  engineCycleVerified: z.literal(false),
});
export type EvolutionState = z.infer<typeof evolutionSchema>;
export type EvolutionDeck = Partial<Record<'knight' | 'furnace', number>>;

// This counter is separate from the four-card draw queue. Only playing this
// particular card charges its evolution; an ability or a spawned child does not.
export class EvolutionCycles {
  readonly cards: Array<{ card: 'knight' | 'furnace'; cycles: number; remaining: number[] }>;
  constructor(deck: EvolutionDeck = {}) {
    this.cards = (Object.entries(deck) as Array<['knight' | 'furnace', number]>).map(([card, cycles]) => ({
      card,
      cycles,
      remaining: [cycles],
    }));
  }
  uncertain() {
    for (const state of this.cards)
      state.remaining.splice(
        0,
        state.remaining.length,
        ...Array.from({ length: state.cycles + 1 }, (_, i) => i),
      );
  }
  play(card: CardId, observedVariant: 'base' | 'evolution' | 'unknown' = 'unknown') {
    const state = this.cards.find((entry) => entry.card === card);
    if (!state) return;
    const possible =
      observedVariant === 'evolution'
        ? [0]
        : observedVariant === 'base'
          ? state.remaining.filter((remaining) => remaining > 0)
          : state.remaining;
    const before = possible.length ? possible : Array.from({ length: state.cycles }, (_, i) => i + 1);
    state.remaining.splice(
      0,
      state.remaining.length,
      ...new Set(before.map((remaining) => (remaining === 0 ? state.cycles : remaining - 1))),
    );
  }
  snapshot(): EvolutionState[] {
    return this.cards.map(({ card, cycles, remaining }) => ({
      card,
      cycles,
      normalPlaysBeforeEvolved: { min: Math.min(...remaining), max: Math.max(...remaining) },
      nextDeploy: remaining.every((value) => value === 0)
        ? 'evolution'
        : remaining.every((value) => value > 0)
          ? 'base'
          : 'unknown',
      counterExact: remaining.length === 1,
      basis: 'configured_deck_and_confirmed_card_plays',
      // Input accounting is verified, the site's exact evolution timing is not.
      engineCycleVerified: false,
    }));
  }
}

export const abilitySchema = z.object({
  card: z.literal('ice_wizard'),
  cost: z.literal(2),
  instance: z.int().nonnegative(),
  availability: z.enum(['ready', 'not_visible', 'used', 'untracked']),
  buttonVisible: z.boolean(),
  observedAt: z.number(),
  target: z.object({ x: z.number(), y: z.number() }),
  source: z.literal('screen_button'),
  visualDistance: z.number().nonnegative(),
  blueCoverage: z.number().min(0).max(1),
});
export type HeroAbility = z.infer<typeof abilitySchema>;
