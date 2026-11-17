import { uniqBy } from 'es-toolkit';

import { COMBAT, PLACEMENT_EFFECTS } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { distance, screenPoint, tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import { combatBody, forecastEffect } from './combat-projection.ts';
import type { PlacementField, PlacementOption } from './placement.ts';

export function poisonPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
  const enemy = situation.opponent.units
    .filter((unit) => unit.confidence >= 0.75)
    .toSorted((a, b) => b.y - a.y)
    .slice(0, 10);
  const bodies = enemy.map((unit) => combatBody(profile, unit));
  const graveyards =
    situation.effects?.filter(
      (effect) => effect.card === 'graveyard' && (!effect.onsetCertain || effect.visibleAgeMs < 9000),
    ) ?? [];
  const projected = enemy.flatMap((unit) =>
    [1, 2.5].map((time) => ({
      x: unit.x + (unit.velocity?.xPerSecond ?? 0) * time,
      y: unit.y + (unit.velocity?.yPerSecond ?? 0) * time,
    })),
  );
  const clusters = projected.slice(0, 10).flatMap((point, index) =>
    projected
      .slice(index + 1, 10)
      .filter((other) => distance(point, other) < 90)
      .slice(0, 2)
      .map((other) => ({ x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 })),
  );
  const points = [
    ...graveyards.flatMap((effect) => [
      { x: effect.x, y: effect.y },
      { x: effect.x - 22, y: effect.y },
      { x: effect.x + 22, y: effect.y },
      { x: effect.x, y: effect.y + 18 },
      { x: effect.x, y: effect.y - 18 },
    ]),
    ...projected,
    ...clusters,
    ...[3.5, 14.5].flatMap((x) => [screenPoint(profile, [x, 6.5]), screenPoint(profile, [x, 25.5])]),
  ];
  const own = situation.own.units.map((unit) => combatBody(profile, unit));
  return uniqBy(
    points.map((point) => ({
      x: Math.round(
        Math.max(profile.arena.x + 8, Math.min(profile.arena.x + profile.arena.width - 8, point.x)),
      ),
      y: Math.round(
        Math.max(profile.arena.y + 8, Math.min(profile.arena.y + profile.arena.height - 8, point.y)),
      ),
    })),
    (point) => `${point.x}:${point.y}`,
  )
    .map((target) => {
      const [x, y] = tilePoint(profile, target);
      const forecast = forecastEffect({
        card: 'poison',
        kind: 'card',
        x,
        y,
        own,
        enemy: bodies,
        enemyCycle: [],
        enemyMana: { min: 0, max: 10 },
      });
      const coverage = graveyards.reduce(
        (sum, effect) =>
          sum + Math.max(0, 1 - distance(target, effect) / 75) * (effect.side === 'red' ? 2.5 : 0.3),
        0,
      );
      const duplicate = situation.effects?.some(
        (effect) =>
          effect.side === 'blue' &&
          effect.card === 'poison' &&
          effect.visibleAgeMs < 6000 &&
          distance(target, effect) < 48,
      )
        ? 6
        : 0;
      const kingRisk =
        Math.hypot(x - (18 - DEPLOYMENT.kingTowerTile[0]), y - (32 - DEPLOYMENT.kingTowerTile[1])) <
        PLACEMENT_EFFECTS.poison.radius + COMBAT.policy.kingFootprintRadius
          ? 7
          : 0;
      return {
        target,
        score: forecast.trajectoryDamage / 184 + coverage - duplicate - kingRisk,
        description:
          'Poison projected troop exposure / Graveyard coverage; avoid duplicate and King activation',
      };
    })
    .toSorted((a, b) => b.score - a.score)
    .reduce<PlacementOption[]>(
      (selected, option) =>
        selected.length < 5 && selected.every((other) => distance(other.target, option.target) > 24)
          ? [...selected, { target: option.target, description: option.description }]
          : selected,
      [],
    );
}

export function graveyardPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
  const measured = profile.observedGraveyardCenters;
  // Reviewed input location takes precedence over inferred visual effect centers.
  const points =
    profile.graveyardPlacement === 'tower_adjacent_outer_tile'
      ? (
          [
            [2.5, 25.5],
            [15.5, 25.5],
          ] as const
        ).map((tile) => screenPoint(profile, tile))
      : measured
        ? [
            ...measured.left.map(([dx, dy]) => screenPoint(profile, [3.5 + dx, 25.5 + dy])),
            ...measured.right.map(([dx, dy]) => screenPoint(profile, [14.5 + dx, 25.5 + dy])),
          ]
        : [3.5, 14.5].flatMap((x) =>
            (
              [
                [x, 25.5],
                [x + (x < 9 ? -1.2 : 1.2), 25],
                [x, 24.3],
              ] as const
            ).map((tile) => screenPoint(profile, tile)),
          );
  return points
    .map((target) => {
      const defenders = situation.opponent.units
        .filter((unit) => distance(unit, target) < 75)
        .reduce(
          (sum, unit) => sum + (['ice_wizard', 'goblin_hut'].includes(unit.kind ?? unit.card ?? '') ? 2 : 1),
          0,
        );
      const support = situation.own.units.filter(
        (unit) =>
          ['knight', 'furnace'].includes(unit.kind ?? unit.card ?? '') &&
          unit.y < profile.riverY + 30 &&
          Math.abs(unit.x - target.x) < 55,
      ).length;
      const poison = situation.effects?.some(
        (effect) =>
          effect.side === 'red' && effect.card === 'poison' && distance(effect, target) < effect.radius + 20,
      )
        ? 3
        : 0;
      return {
        target,
        score: support * 2 - defenders - poison + (measured && (target.x < 85 || target.x > 283) ? 0.5 : 0),
        description:
          profile.graveyardPlacement === 'tower_adjacent_outer_tile'
            ? 'Graveyard one outer tile beside the tower; compare defenders, tank arrival and enemy Poison'
            : 'Graveyard tower offset; compare observed defenders, tank arrival and enemy Poison',
      };
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ target, description }) => ({ target, description }));
}
