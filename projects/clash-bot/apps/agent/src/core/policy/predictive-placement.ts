import { uniqBy } from 'es-toolkit';

import type { CardId } from '../cards.ts';
import { COMBAT, PLACEMENT_EFFECTS } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { screenPoint, tilePoint, type Point } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import { combatBody, forecastEffect } from './combat-projection.ts';
import {
  graveyardThreat,
  ownPoint,
  unitPlacements,
  type PlacementField,
  type PlacementOption,
} from './placement.ts';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function projectedPlacements(profile: Profile, card: CardId, situation?: PlacementField): PlacementOption[] {
  if (!situation || !['ice_wizard', 'barbarian_barrel'].includes(card)) return [];
  const enemy = situation.opponent.units
    .filter((unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 90)
    .map((unit) => combatBody(profile, unit));
  const own = situation.own.units.map((unit) => combatBody(profile, unit));
  const targets = enemy.flatMap((unit) => {
    if (card === 'barbarian_barrel')
      return [0.2, 0.65, 1.1].map((roll) => {
        const time = COMBAT.inputDelaySeconds + COMBAT.barbarian_barrel.deploySeconds + roll;
        return {
          x: unit.x + (unit.velocity?.[0] ?? 0) * time,
          y: unit.y + (unit.velocity?.[1] ?? 0) * time - COMBAT.barbarian_barrel.speed * roll,
        };
      });
    const time = COMBAT.inputDelaySeconds + COMBAT.ice_wizard.deploySeconds;
    const x = unit.x + (unit.velocity?.[0] ?? 0) * time,
      y = unit.y + (unit.velocity?.[1] ?? 0) * time;
    return [
      { x, y },
      { x: x - 1.8, y: y - 1.2 },
      { x: x + 1.8, y: y - 1.2 },
      { x, y: y - 2.5 },
    ];
  });
  return targets
    .flatMap((point) => {
      const target = ownPoint(profile, card, screenPoint(profile, [point.x, point.y]), situation);
      if (!target) return [];
      const [x, y] = tilePoint(profile, target);
      const forecast = forecastEffect({
        card,
        kind: 'card',
        x,
        y,
        own,
        enemy,
        enemyCycle: [],
        enemyMana: { min: 0, max: 10 },
      });
      const poison = situation.effects?.some(
        (effect) =>
          effect.side === 'red' && effect.card === 'poison' && distance(target, effect) < effect.radius,
      )
        ? 4
        : 0;
      const melee =
        card === 'ice_wizard'
          ? situation.opponent.units.filter(
              (unit) =>
                ['knight', 'barbarian'].includes(unit.kind ?? unit.card ?? '') && distance(target, unit) < 35,
            ).length * 2
          : 0;
      return [
        {
          target,
          description: `${card} intercept after deployment and movement`,
          score: forecast.kills[0] * 4 + forecast.trajectoryDamage / 100 - poison - melee,
        },
      ];
    })
    .toSorted((a, b) => b.score - a.score)
    .reduce<PlacementOption[]>(
      (selected, option) =>
        selected.length < 4 && selected.every((other) => distance(option.target, other.target) > 18)
          ? [...selected, { target: option.target, description: option.description }]
          : selected,
      [],
    );
}

// The frozen controller 1 retains unitPlacements. The candidate's physical
// option generator can improve without silently rewriting its comparator.
function hutPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
  const enemy = situation.opponent.units
    .filter((unit) => unit.confidence >= 0.75)
    .map((unit) => combatBody(profile, unit));
  const existing = situation.own.units.filter((unit) => (unit.kind ?? unit.card) === 'goblin_hut');
  const points = [5, 6.5, 8, 9, 10, 11.5, 13].flatMap((x) =>
    [6.5, 8, 9.5, 11, 12.5, 14].map((y) => [x, y] as const),
  );
  return points
    .flatMap((tile) => {
      const target = ownPoint(profile, 'goblin_hut', screenPoint(profile, tile), situation);
      if (!target) return [];
      const [x, y] = tilePoint(profile, target);
      const nearby = enemy.filter(
        (unit) =>
          Math.hypot(unit.x + (unit.velocity?.[0] ?? 0) - x, unit.y + (unit.velocity?.[1] ?? 0) - y) <= 6,
      );
      const covered = nearby.filter((unit) =>
        existing.some((hut) => {
          const other = tilePoint(profile, hut);
          return Math.hypot(unit.x - other[0], unit.y - other[1]) <= 6;
        }),
      ).length;
      const stacked = existing.filter((hut) => distance(target, hut) < 70).length;
      const poison =
        situation.effects?.filter(
          (effect) =>
            effect.side === 'red' &&
            effect.card === 'poison' &&
            distance(target, effect) < effect.radius + 12,
        ).length ?? 0;
      const graveyard = graveyardThreat(profile, situation);
      const coverage = graveyard && distance(target, graveyard) < 100 ? 1 : 0;
      const score =
        nearby.length * 2 -
        covered * 1.5 -
        stacked * 4 -
        poison * 5 +
        coverage -
        Math.abs(x - 9) * 0.14 -
        Math.abs(y - 11.25) * 0.12 -
        Math.max(0, y - 13) * 0.6;
      return [
        {
          target,
          score,
          description: 'Goblin Hut dedicated pull/activation coverage; compare existing Hut and Poison',
        },
      ];
    })
    .toSorted((a, b) => b.score - a.score)
    .reduce<PlacementOption[]>(
      (selected, option) =>
        selected.length < 5 && selected.every((other) => distance(other.target, option.target) > 27)
          ? [...selected, { target: option.target, description: option.description }]
          : selected,
      [],
    );
}

function poisonPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
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

function graveyardPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
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

export function predictivePlacements(
  profile: Profile,
  card: CardId,
  threats: Point[],
  situation: PlacementField,
): PlacementOption[] {
  if (card === 'graveyard') return graveyardPlacements(profile, situation);
  if (card === 'poison') return poisonPlacements(profile, situation);
  if (card === 'goblin_hut') return hutPlacements(profile, situation);
  // Distant enemy bodies are board context, not a defensive deployment target.
  const defensiveThreats = threats.filter((point) => point.y > profile.riverY);
  const existing = unitPlacements(profile, card, defensiveThreats, situation);
  if (['knight', 'furnace', 'skeletons'].includes(card)) {
    const drill = situation.opponent.units.find(
      (unit) => unit.kind === 'goblin_drill' && unit.confidence >= 0.75 && unit.y > profile.riverY,
    );
    const drillDefense =
      drill && ['knight', 'skeletons'].includes(card)
        ? [-12, 12].flatMap((offset) => {
            const target = ownPoint(profile, card, { x: drill.x + offset, y: drill.y + 5 }, situation);
            return target
              ? [
                  {
                    target,
                    description: `${card} intercept emerged Goblin Drill and death-spawned Goblins; compare deployment phase`,
                  },
                ]
              : [];
          })
        : [];
    const firecracker = situation.opponent.units.find(
      (unit) => unit.kind === 'firecracker' && unit.confidence >= 0.85 && unit.y > profile.riverY - 55,
    );
    const centralPull =
      firecracker && ['knight', 'skeletons'].includes(card)
        ? [8, 10].flatMap((x) => {
            const target = ownPoint(profile, card, screenPoint(profile, [x, 12.5]), situation);
            return target
              ? [
                  {
                    target,
                    description:
                      'central Firecracker lure; compare shot direction, tower support and spell cleanup',
                  },
                ]
              : [];
          })
        : [];
    const urgent =
      defensiveThreats.length > 0 ||
      graveyardThreat(profile, situation) !== undefined ||
      situation.opponent.units.some((unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 55);
    if (urgent) {
      const rear = existing.filter((option) => option.description.includes('behind the King Tower'));
      const defense = uniqBy(
        [...drillDefense, ...centralPull, ...existing.filter((option) => !rear.includes(option))],
        (option) => `${option.target.x}:${option.target.y}`,
      );
      return [...defense.slice(0, 5 - rear.length), ...rear];
    }
    const rearTiles =
      card === 'skeletons'
        ? ([[9, 0.5], ...DEPLOYMENT.kingBackTiles] as const)
        : [
            ...DEPLOYMENT.kingBackTiles,
            ...([
              [3.5, 3],
              [14.5, 3],
            ] as const),
          ];
    const rear = rearTiles.flatMap((tile) => {
      const target = ownPoint(profile, card, screenPoint(profile, tile), situation);
      return target ? [{ target, description: `${card} calm rear buildup; preserve defense and cycle` }] : [];
    });
    const support = existing.filter((option) => option.description.includes('behind advancing'));
    return uniqBy([...support, ...rear], (option) => `${option.target.x}:${option.target.y}`).slice(0, 5);
  }
  if (!['ice_wizard', 'barbarian_barrel'].includes(card)) return existing;
  const projected = projectedPlacements(profile, card, situation);
  const approaching = situation.opponent.units.some(
    (unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 90,
  );
  const urgent = approaching || graveyardThreat(profile, situation) !== undefined;
  const rear = DEPLOYMENT.kingBackTiles.map((point) => ({
    target: screenPoint(profile, point),
    description: 'Ice Wizard safe rear buildup',
  }));
  const legal = (option: PlacementOption) => {
    const target = ownPoint(profile, card, option.target, situation);
    return target ? [{ ...option, target }] : [];
  };
  const key = (option: PlacementOption) => `${option.target.x}:${option.target.y}`;
  if (card === 'barbarian_barrel') {
    const idle = [95, 273].map((x) => ({
      target: { x, y: profile.riverY + 25 },
      description: 'Barrel straight lane; compare holding for defense',
    }));
    return uniqBy([...projected, ...idle].flatMap(legal), key).slice(0, 5);
  }
  if (urgent) {
    const defenses = uniqBy([...projected, ...existing].flatMap(legal), key).filter(
      (option) => !rear.some((back) => distance(back.target, option.target) < 15),
    );
    return [...defenses.slice(0, 4), ...rear.slice(0, 1).flatMap(legal)];
  }
  const tanks = situation.own.units.filter(
    (unit) => ['knight', 'furnace'].includes(unit.kind ?? unit.card ?? '') && unit.y < profile.riverY + 120,
  );
  const support = tanks.map((unit) => ({
    target: { x: unit.x, y: unit.y + (unit.velocity?.yPerSecond ?? 0) * 1.5 + 35 },
    description: 'Ice Wizard follows the advancing tank after deployment',
  }));
  const buildup = [
    ...support,
    ...rear,
    ...(
      [
        [3.5, 3],
        [14.5, 3],
        [9, 0.5],
      ] as const
    ).map((tile) => ({
      target: screenPoint(profile, tile),
      description: 'Ice Wizard rear buildup with deployment time',
    })),
  ];
  return uniqBy(buildup.flatMap(legal), key).slice(0, 5);
}
