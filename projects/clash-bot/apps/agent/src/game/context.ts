import type { BattleSituation, FieldUnit } from '../counterpush/domain/battle-state.ts';

// Keep full evidence in states.jsonl, but avoid repeating long field names and
// historical timestamps for every visible skeleton in each expensive VLM call.
export function policyContext(situation: BattleSituation) {
  const cycle = (value: BattleSituation['own']['cycle']) =>
    value
      ? {
          exact: value.exact,
          missed: value.mayHaveMissed,
          hypotheses: value.hypotheses,
          couldHold: value.couldHold,
          nextDraw: value.nextDraw,
          returnWaitColumns: ['card', 'minPlays', 'maxPlays'],
          returnWait: Object.entries(value.returnsAfterPlays).map(([card, wait]) => [
            card,
            wait.min,
            wait.max,
          ]),
        }
      : null;
  const evolutions = (value: BattleSituation['own']['evolutions']) =>
    value?.map((entry) => [
      entry.card,
      entry.normalPlaysBeforeEvolved.min,
      entry.normalPlaysBeforeEvolved.max,
      entry.nextDeploy,
      entry.counterExact,
    ]);
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
    evolutionColumns: ['card', 'normalUsesMin', 'normalUsesMax', 'nextDeployEstimate', 'counterExact'],
    evolutionBasis: 'reference cycles + confirmed card uses; engine cycle not yet verified',
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
      cycle: cycle(situation.own.cycle),
      evolutions: evolutions(situation.own.evolutions),
      ability: situation.own.ability
        ? {
            card: situation.own.ability.card,
            cost: situation.own.ability.cost,
            state: situation.own.ability.availability,
            instance: situation.own.ability.instance,
          }
        : undefined,
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
      cycle: cycle(situation.opponent.cycle),
      evolutions: evolutions(situation.opponent.evolutions),
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
