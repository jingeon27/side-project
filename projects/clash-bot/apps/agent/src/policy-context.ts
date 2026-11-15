import type { BattleSituation, FieldUnit } from './counterpush/battle-state.ts';

// Keep full evidence in states.jsonl, but avoid repeating long field names and
// historical timestamps for every visible skeleton in each expensive VLM call.
export function policyContext(situation: BattleSituation) {
  const row = (unit: FieldUnit) => [
    unit.trackId ?? '',
    unit.kind ?? unit.card ?? '?',
    unit.card,
    unit.sourceCard ?? '',
    Math.round(unit.x),
    Math.round(unit.y),
    Math.round(unit.velocity?.xPerSecond ?? 0),
    Math.round(unit.velocity?.yPerSecond ?? 0),
    Math.round(unit.confidence * 100) / 100,
    unit.variant ?? 'unknown',
    unit.possibleParent ?? '',
  ];
  return {
    at: situation.at,
    visibility: situation.visibility,
    unitColumns: [
      'id',
      'kind_hypothesis',
      'card_prototype_not_new_spend',
      'spawn_source',
      'x',
      'y',
      'vx_px_s',
      'vy_px_s',
      'visual_score',
      'variant',
      'possible_parent',
    ],
    own: {
      elixir: situation.own.elixir,
      hand: situation.own.hand,
      cycle: situation.own.cycle,
      evolutions: situation.own.evolutions ?? [],
      ability: situation.own.ability,
      recentAbilities: situation.own.recentAbilities?.map((entry) => ({
        card: entry.card,
        cost: entry.cost,
        ageMs: situation.at - entry.at,
        instance: entry.instance,
      })),
      units: situation.own.units.slice(0, 18).map(row),
      recentPlays: situation.own.recentPlays
        .slice(-8)
        .map((play) => ({ card: play.card, ageMs: situation.at - play.at, target: play.target })),
    },
    opponent: {
      elixir: situation.opponent.elixir,
      cycle: situation.opponent.cycle,
      evolutions: situation.opponent.evolutions ?? [],
      ability: 'unobserved; availability and previous activation are unknown',
      units: situation.opponent.units.slice(0, 24).map(row),
      seenSpent: situation.opponent.seenSpent,
    },
    effects: situation.effects ?? [],
    spawners: situation.spawners ?? [],
    accounting: situation.elixirAccounting,
    uncertainty:
      'Visual scores are not calibrated probabilities. Velocity and tile scale are approximate. Stopped does not prove attacking; unseen does not prove dead. Pattern predictions are first visibility, not exact spawn times.',
  };
}
