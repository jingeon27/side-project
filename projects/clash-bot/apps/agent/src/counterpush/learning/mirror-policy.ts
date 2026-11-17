import { uniqBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { BattleSituation, FieldUnit } from '../../core/battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../../core/cards.ts';
import { tilePoint, type Point } from '../../core/geometry.ts';
import { combatBody } from '../../core/placement/combat-projection.ts';
import { predictivePlacements } from '../../core/placement/predictive-placement.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import { bodyCard } from '../../core/policy/candidates.ts';
import type { DecisionUnit, PublicDecisionContext } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';

export const rotateOpponentPoint = (profile: Pick<Profile, 'riverY'>, point: Point): Point => ({
  x: 368 - point.x,
  y: 2 * profile.riverY - point.y,
});

// Only public BEFORE facts change sides. Our private hand, next card, exact mana
// and ability ownership must not become the teacher's knowledge of its enemy.
export function mirrorContext(
  profile: Profile,
  situation: BattleSituation,
  actions: QwenAction[],
): PublicDecisionContext {
  const row = (unit: FieldUnit): DecisionUnit => [
    bodyCard(unit) ?? '?',
    ...tilePoint(profile, rotateOpponentPoint(profile, unit)),
    unit.variant ?? '?',
  ];
  return {
    hand: [null, null, null, null],
    elixir: situation.opponent.elixir,
    enemyElixir: { min: 0, max: 10 },
    enemyCycle: situation.own.recentPlays
      .filter((play) => play.at <= situation.at)
      .slice(-4)
      .toReversed()
      .map((play, index) => [play.card, 4 - index, 4 - index]),
    own: situation.opponent.units
      .toSorted((a, b) => b.y - a.y)
      .slice(0, 5)
      .map(row),
    enemy: situation.own.units
      .toSorted((a, b) => a.y - b.y)
      .slice(0, 8)
      .map(row),
    bodies: {
      own: situation.opponent.units
        .toSorted((a, b) => b.y - a.y)
        .map((unit) =>
          combatBody(profile, {
            ...unit,
            ...rotateOpponentPoint(profile, unit),
            velocity: unit.velocity
              ? {
                  ...unit.velocity,
                  xPerSecond: -unit.velocity.xPerSecond,
                  yPerSecond: -unit.velocity.yPerSecond,
                }
              : undefined,
          }),
        ),
      enemy: situation.own.units
        .toSorted((a, b) => a.y - b.y)
        .map((unit) =>
          combatBody(profile, {
            ...unit,
            ...rotateOpponentPoint(profile, unit),
            velocity: unit.velocity
              ? {
                  ...unit.velocity,
                  xPerSecond: -unit.velocity.xPerSecond,
                  yPerSecond: -unit.velocity.yPerSecond,
                }
              : undefined,
          }),
        ),
    },
    effects: situation.effects
      ?.slice(0, 4)
      .map((effect) => [
        effect.side === 'red' ? 'blue' : 'red',
        effect.card,
        ...tilePoint(profile, rotateOpponentPoint(profile, effect)),
        effect.onsetCertain ? Math.round(effect.visibleAgeMs / 1000) : null,
      ]),
    skill: 'unknown',
    actions: actions.map((action, index) => [
      String.fromCharCode(65 + index),
      action.card ? 'card' : 'wait',
      action.card,
      action.card ? CARD_INFO[action.card].cost : 0,
      ...tilePoint(profile, action.target),
    ]),
  };
}

// The pool depends only on the BEFORE board, never on the demonstrated target.
// Unseen hand slots stay unknown: these are possible intents, not live inputs.
export function mirrorActions(profile: Profile, deck: CardId[], situation: BattleSituation): QwenAction[] {
  const reflectUnit = (unit: FieldUnit) => ({
    ...unit,
    ...rotateOpponentPoint(profile, unit),
    velocity: unit.velocity
      ? { ...unit.velocity, xPerSecond: -unit.velocity.xPerSecond, yPerSecond: -unit.velocity.yPerSecond }
      : undefined,
  });
  const field = {
    own: { units: situation.opponent.units.map(reflectUnit) },
    opponent: { units: situation.own.units.map(reflectUnit) },
    effects: situation.effects?.map((effect) => ({
      ...effect,
      ...rotateOpponentPoint(profile, effect),
      side: effect.side === 'red' ? ('blue' as const) : ('red' as const),
      predictions: effect.predictions?.map((point) => ({ ...point, ...rotateOpponentPoint(profile, point) })),
    })),
  };
  const invaders = situation.own.units
    .filter((unit) => unit.confidence >= 0.85)
    .map((unit) => rotateOpponentPoint(profile, unit))
    .toSorted((a, b) => b.y - a.y);
  const plays = deck.flatMap((card) => {
    if (CARD_INFO[card].cost > situation.opponent.elixir.max) return [];
    const limit = match(card)
      .with('poison', 'graveyard', () => 5)
      .with('ice_wizard', () => 4)
      .with('goblin_hut', () => 3)
      .otherwise(() => 2);
    const targets = predictivePlacements(
      profile,
      card,
      invaders.filter((point) => point.y > profile.riverY),
      field,
    )
      .slice(0, limit)
      .map((option) => option.target);
    return uniqBy(targets, (point) => `${Math.round(point.x)}:${Math.round(point.y)}`).map((target) => ({
      slot: 0,
      card,
      cost: CARD_INFO[card].cost,
      target,
      description: 'BLUE mirrored public-before intent; hidden hand unknown',
    }));
  });
  return [
    { id: 0, slot: 0, card: null, cost: 0, target: { x: 0, y: 0 }, description: 'wait' },
    ...plays.map((play, index) => ({ ...play, id: index + 1 })),
  ];
}
