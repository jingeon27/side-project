import { uniqBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { BattleSituation, FieldUnit } from '../../core/battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../../core/cards.ts';
import { screenPoint, tilePoint, type Point } from '../../core/geometry.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import { bodyCard } from '../../core/policy/candidates.ts';
import type { DecisionUnit, PublicDecisionContext } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';

export const reflectPoint = (profile: Pick<Profile, 'riverY'>, point: Point): Point => ({
  x: point.x,
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
    ...tilePoint(profile, reflectPoint(profile, unit)),
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
    effects: situation.effects
      ?.slice(0, 4)
      .map((effect) => [
        effect.side === 'red' ? 'blue' : 'red',
        effect.card,
        ...tilePoint(profile, reflectPoint(profile, effect)),
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
  const invaders = situation.own.units
    .filter((unit) => unit.confidence >= 0.85)
    .map((unit) => reflectPoint(profile, unit))
    .toSorted((a, b) => b.y - a.y);
  const points = (tiles: ReadonlyArray<readonly [number, number]>) =>
    tiles.map((tile) => screenPoint(profile, tile));
  const plays = deck.flatMap((card) => {
    if (CARD_INFO[card].cost > situation.opponent.elixir.max) return [];
    const targets = match(card)
      .with('poison', () => [
        ...points([
          [3.5, 6.5],
          [14.5, 6.5],
          [3.5, 25.5],
          [14.5, 25.5],
        ]),
        ...invaders.slice(0, 2),
      ])
      .with('graveyard', () =>
        points([
          [3.5, 25.5],
          [2.5, 25],
          [14.5, 25.5],
          [15.5, 25],
        ]),
      )
      .with('goblin_hut', () =>
        points([
          [9, 11.25],
          [6.5, 11.25],
          [11.5, 11.25],
          [3.5, 10],
          [14.5, 10],
        ]),
      )
      .otherwise(() =>
        invaders[0]
          ? [
              {
                x: invaders[0].x,
                y: Math.min(
                  profile.arena.y + profile.arena.height - 15,
                  invaders[0].y + (card === 'ice_wizard' || card === 'furnace' ? 45 : 18),
                ),
              },
              {
                x: invaders[0].x + (invaders[0].x < 184 ? 35 : -35),
                y: Math.min(profile.arena.y + profile.arena.height - 15, invaders[0].y + 25),
              },
            ]
          : points([
              [3.5, 10],
              [14.5, 10],
            ]),
      );
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
