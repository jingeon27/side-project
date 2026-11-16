import { uniqBy } from 'es-toolkit';

import type { BattleSituation, FieldEffect } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import { COMBAT, PLACEMENT_EFFECTS } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { screenPoint, tilePoint, type Point } from '../geometry.ts';
import { CARD_MECHANICS, UNIT_MECHANICS } from '../knowledge.ts';
import type { Profile } from '../profile.ts';
import { combatBody, forecastEffect } from './combat-projection.ts';

export type PlacementField = {
  own: Pick<BattleSituation['own'], 'units'>;
  opponent: Pick<BattleSituation['opponent'], 'units'>;
  effects?: FieldEffect[];
};

export type PlacementOption = { target: Point; description: string };
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);

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
          score: forecast.kills[0] * 4 + forecast.kills[1] + forecast.damage[1] / 100 - poison - melee,
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

// Conservative image-space footprints, not access to the game's collision map.
export function blockedDeployment(profile: Profile, card: CardId, point: Point, situation?: PlacementField) {
  if (point.x > 306 && point.y > 454) return true; // visible hero-control overlay
  if (CARD_INFO[card].role === 'spell') return false;
  const towers = [
    { x: 95, y: profile.riverY + 130, halfHeight: 31 },
    { x: 273, y: profile.riverY + 130, halfHeight: 31 },
    { ...screenPoint(profile, DEPLOYMENT.kingTowerTile), halfHeight: 27 },
  ];
  return (
    towers.some(
      (tower) => Math.abs(point.x - tower.x) < 27 && Math.abs(point.y - tower.y) < tower.halfHeight,
    ) ||
    (situation?.own.units.some(
      (unit) =>
        unit.card === 'goblin_hut' &&
        unit.confidence >= 0.85 &&
        Math.abs(point.x - unit.x) < 23 &&
        Math.abs(point.y - unit.y) < 26,
    ) ??
      false)
  );
}

export function ownPoint(
  profile: Profile,
  card: CardId,
  point: Point,
  situation?: PlacementField,
): Point | null {
  const clamp = (candidate: Point) => ({
    x: Math.round(
      Math.max(profile.arena.x + 10, Math.min(profile.arena.x + profile.arena.width - 10, candidate.x)),
    ),
    y: Math.round(
      Math.max(profile.riverY + 20, Math.min(profile.arena.y + profile.arena.height - 8, candidate.y)),
    ),
  });
  const target = clamp(point);
  if (!blockedDeployment(profile, card, target, situation)) return target;
  if (card === 'goblin_hut') return null;
  const adjacent = clamp({ x: target.x + (target.x < 184 ? 40 : -40), y: target.y });
  return blockedDeployment(profile, card, adjacent, situation) ? null : adjacent;
}

export function graveyardThreat(profile: Profile, situation?: PlacementField): FieldEffect | undefined {
  return situation?.effects
    ?.filter(
      (effect) =>
        effect.side === 'red' &&
        effect.card === 'graveyard' &&
        effect.y > profile.riverY &&
        effect.confidence >= 0.8,
    )
    .toSorted((first, second) => second.y - first.y)[0];
}

export function estimatedTileSize(situation?: PlacementField) {
  const poisons =
    situation?.effects
      ?.filter((effect) => effect.card === 'poison' && effect.confidence >= 0.9)
      .map((effect) => effect.radius / 3.5)
      .filter((size) => size >= 13 && size <= 22) ?? [];
  return poisons.length ? poisons.reduce((sum, size) => sum + size, 0) / poisons.length : 17;
}

function graveyardDefense(profile: Profile, card: CardId, situation?: PlacementField): PlacementOption[] {
  const effect = graveyardThreat(profile, situation);
  if (!effect || !situation) return [];
  const tile = estimatedTileSize(situation);
  const mechanic = CARD_MECHANICS[card];
  const range = mechanic?.body
    ? UNIT_MECHANICS[mechanic.body].rangeTiles
    : card === 'goblin_hut'
      ? UNIT_MECHANICS.spear_goblin.rangeTiles
      : 1;
  const hp = mechanic?.body ? UNIT_MECHANICS[mechanic.body].hp : 1180;
  const skeletons = situation.opponent.units.filter(
    (unit) =>
      (unit.kind === 'skeleton' || unit.card === 'skeletons') && distance(unit, effect) < effect.radius * 1.4,
  );
  // Without observed/learned points this is an uncertain AREA coverage test,
  // never a fabricated claim about the fixed skeleton spawn sequence.
  const points = [...skeletons, ...(effect.predictions ?? [])];
  const coveragePoints = points.length
    ? points
    : Array.from({ length: 12 }, (_, index) => ({
        x: effect.x + Math.cos((index * Math.PI) / 6) * effect.radius * 0.8,
        y: effect.y + Math.sin((index * Math.PI) / 6) * effect.radius * 0.8,
      }));
  const grids = Array.from(
    { length: Math.ceil(profile.arena.width / 17) },
    (_, column) => profile.arena.x + 12 + column * 17,
  )
    .flatMap((x) =>
      Array.from(
        { length: Math.ceil((profile.arena.y + profile.arena.height - profile.riverY) / 17) },
        (_, row) => ({ x, y: profile.riverY + 23 + row * 17 }),
      ),
    )
    .filter(
      (point) =>
        point.x < profile.arena.x + profile.arena.width - 10 &&
        point.y < profile.arena.y + profile.arena.height - 25,
    )
    .filter(
      (point) =>
        distance(point, effect) < effect.radius + 75 && !blockedDeployment(profile, card, point, situation),
    );
  const scored = grids
    .map((point) => {
      const coverage =
        coveragePoints.filter((spawn) => distance(spawn, point) <= range * tile).length /
        coveragePoints.length;
      const spawnBurst =
        card === 'ice_wizard' && skeletons.length
          ? skeletons.filter(
              (skeleton) => distance(skeleton, point) < UNIT_MECHANICS.ice_wizard.spawnRadiusTiles * tile,
            ).length / skeletons.length
          : 0; // deployment damage cannot hit skeletons that do not exist yet
      const poison =
        situation.effects
          ?.filter(
            (hazard) =>
              hazard.side === 'red' && hazard.card === 'poison' && distance(point, hazard) < hazard.radius,
          )
          .reduce(
            (sum, hazard) =>
              sum +
              (PLACEMENT_EFFECTS.poison.dps *
                Math.max(1, PLACEMENT_EFFECTS.poison.duration - hazard.visibleAgeMs / 1000)) /
                hp,
            0,
          ) ?? 0;
      const meleeRisk = situation.opponent.units
        .filter((unit) => unit.confidence >= 0.85 && ['knight', 'barbarian_barrel'].includes(unit.card ?? ''))
        .reduce((sum, unit) => sum + (distance(point, unit) < 35 && range > 3 ? 0.7 : 0), 0);
      return {
        point,
        score: coverage * 2 + spawnBurst * 0.6 - poison * 1.5 - meleeRisk - distance(point, effect) / 500,
      };
    })
    .toSorted((first, second) => second.score - first.score);
  return scored.reduce<PlacementOption[]>(
    (selected, candidate) =>
      selected.length < 3 && selected.every((item) => distance(item.target, candidate.point) > 35)
        ? [
            ...selected,
            {
              target: candidate.point,
              description: `${card} Graveyard defense; estimated ${range}-tile reach, spawn phase and visible Poison considered`,
            },
          ]
        : selected,
    [],
  );
}

export function unitPlacements(
  profile: Profile,
  card: CardId,
  threats: Point[],
  situation?: PlacementField,
): PlacementOption[] {
  const nearest = threats.toSorted((first, second) => second.y - first.y)[0];
  const support = CARD_INFO[card].role === 'support';
  const rearY = profile.arena.y + profile.arena.height - 45;
  const approaching = situation?.opponent.units
    .filter((unit) => unit.y > profile.riverY - 100 && unit.y <= profile.riverY && unit.confidence >= 0.75)
    .toSorted((first, second) => second.y - first.y)[0];
  const tanks =
    situation?.own.units
      .filter(
        (unit) =>
          ['knight', 'furnace'].includes(unit.card ?? '') &&
          unit.confidence >= 0.85 &&
          unit.y < profile.riverY + 100,
      )
      .toSorted((first, second) => first.y - second.y) ?? [];
  const opening: PlacementOption[] =
    card === 'barbarian_barrel'
      ? [95, 273].map((x) => ({
          target: { x, y: profile.riverY + 25 },
          description: `barrel ${x < 184 ? 'left' : 'right'} bridge pressure`,
        }))
      : card === 'goblin_hut'
        ? [184, 143, 225].map((x) => ({
            target: { x, y: profile.riverY + 65 },
            description: `goblin hut ${x === 184 ? 'center' : 'lane'} pull`,
          }))
        : card === 'skeletons'
          ? [
              { target: { x: 184, y: rearY - 25 }, description: 'center Skeletons cycle and split' },
              ...[95, 273].map((x) => ({
                target: { x, y: profile.riverY + 40 },
                description: 'Skeletons forward lane pressure',
              })),
              ...[140, 228].map((x) => ({ target: { x, y: rearY }, description: 'cheap inside-lane cycle' })),
            ]
          : [
              ...[95, 273].map((x) => ({
                target: { x, y: profile.riverY + (support ? 90 : 40) },
                description: `${card} ${support ? 'midfield support' : 'forward lane pressure'}`,
              })),
              { target: { x: 184, y: profile.riverY + 92 }, description: `${card} central positioning` },
              ...[140, 228].map((x) => ({
                target: { x, y: rearY },
                description: `${card} rear inside-lane build`,
              })),
            ];
  const graveyard = graveyardThreat(profile, situation);
  const dynamic: PlacementOption[] = [
    ...(card === 'barbarian_barrel' && graveyard
      ? [
          {
            target: { x: graveyard.x, y: graveyard.y + 28 },
            description:
              'barrel through Graveyard skeletons; Barbarian follows, does not clear the entire spell',
          },
        ]
      : graveyardDefense(profile, card, situation)),
    ...(support && tanks[0]
      ? [
          {
            target: { x: tanks[0].x, y: tanks[0].y + (tanks[0].velocity?.yPerSecond ?? 0) * 2 + 55 },
            description: `${card} behind advancing ${tanks[0].card}, allowing for movement and deployment delay`,
          },
        ]
      : []),
    ...(nearest
      ? [
          {
            target: { x: nearest.x, y: nearest.y + (support ? 45 : 18) },
            description: `defend nearest threat with ${card}`,
          },
          {
            target: { x: nearest.x + (nearest.x < 184 ? 38 : -38), y: nearest.y + (support ? 45 : 5) },
            description: `${card} lateral defense and pull`,
          },
        ]
      : []),
    ...(approaching
      ? [
          {
            target: { x: approaching.x, y: profile.riverY + (support ? 80 : 40) },
            description: `${card} prepare against approaching ${approaching.kind ?? approaching.card ?? 'unit'}`,
          },
        ]
      : []),
  ];
  const legal = (option: PlacementOption): PlacementOption[] => {
    const target = ownPoint(profile, card, option.target, situation);
    return target ? [{ ...option, target }] : [];
  };
  const key = (option: PlacementOption) => `${option.target.x}:${option.target.y}`;
  // Reserve rear choices inside the five-candidate budget, including under a visible threat.
  const rear = uniqBy(
    card !== 'goblin_hut' && CARD_INFO[card].role !== 'spell'
      ? DEPLOYMENT.kingBackTiles.flatMap((tile) =>
          legal({ target: screenPoint(profile, tile), description: `${card} build behind the King Tower` }),
        )
      : [],
    key,
  );
  const options = uniqBy([...dynamic, ...opening].flatMap(legal), key).filter(
    (option) => !rear.some((back) => key(back) === key(option)),
  );
  return [...options.slice(0, 5 - rear.length), ...rear];
}

// The frozen controller 1 retains unitPlacements. The candidate's physical
// option generator can improve without silently rewriting its comparator.
export function predictivePlacements(
  profile: Profile,
  card: CardId,
  threats: Point[],
  situation: PlacementField,
): PlacementOption[] {
  const existing = unitPlacements(profile, card, threats, situation);
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
  if (card === 'barbarian_barrel') return uniqBy([...projected, ...existing].flatMap(legal), key).slice(0, 5);
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
