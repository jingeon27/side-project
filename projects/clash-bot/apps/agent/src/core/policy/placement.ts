import type { BattleSituation, FieldEffect } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import type { Point } from '../geometry.ts';
import { CARD_MECHANICS, UNIT_MECHANICS } from '../knowledge.ts';
import type { Profile } from '../profile.ts';

export type PlacementOption = { target: Point; description: string };
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);

// Conservative image-space footprints, not access to the game's collision map.
export function blockedDeployment(profile: Profile, card: CardId, point: Point, situation?: BattleSituation) {
  if (point.x > 306 && point.y > 454) return true; // visible hero-control overlay
  if (CARD_INFO[card].role === 'spell') return false;
  const towers = [
    { x: 95, y: profile.riverY + 130 },
    { x: 273, y: profile.riverY + 130 },
    { x: 184, y: profile.riverY + 190 },
  ];
  return (
    towers.some((tower) => Math.abs(point.x - tower.x) < 27 && Math.abs(point.y - tower.y) < 31) ||
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
  situation?: BattleSituation,
): Point | null {
  const clamp = (candidate: Point) => ({
    x: Math.round(
      Math.max(profile.arena.x + 10, Math.min(profile.arena.x + profile.arena.width - 10, candidate.x)),
    ),
    y: Math.round(
      Math.max(profile.riverY + 20, Math.min(profile.arena.y + profile.arena.height - 25, candidate.y)),
    ),
  });
  const target = clamp(point);
  if (!blockedDeployment(profile, card, target, situation)) return target;
  if (card === 'goblin_hut') return null;
  const adjacent = clamp({ x: target.x + (target.x < 184 ? 40 : -40), y: target.y });
  return blockedDeployment(profile, card, adjacent, situation) ? null : adjacent;
}

export function graveyardThreat(profile: Profile, situation?: BattleSituation): FieldEffect | undefined {
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

export function estimatedTileSize(situation?: BattleSituation) {
  const poisons =
    situation?.effects
      ?.filter((effect) => effect.card === 'poison' && effect.confidence >= 0.9)
      .map((effect) => effect.radius / 3.5)
      .filter((size) => size >= 13 && size <= 22) ?? [];
  return poisons.length ? poisons.reduce((sum, size) => sum + size, 0) / poisons.length : 17;
}

function graveyardDefense(profile: Profile, card: CardId, situation?: BattleSituation): PlacementOption[] {
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
          .reduce((sum, hazard) => sum + (92 * Math.max(1, 8 - hazard.visibleAgeMs / 1000)) / hp, 0) ?? 0;
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
  situation?: BattleSituation,
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
              ...[140, 228].map((x) => ({ target: { x, y: rearY }, description: 'cheap inside-lane cycle' })),
              ...[95, 273].map((x) => ({
                target: { x, y: profile.riverY + 40 },
                description: 'Skeletons forward lane pressure',
              })),
            ]
          : [
              ...[140, 228].map((x) => ({
                target: { x, y: rearY },
                description: `${card} rear inside-lane build`,
              })),
              ...[95, 273].map((x) => ({
                target: { x, y: profile.riverY + (support ? 90 : 40) },
                description: `${card} ${support ? 'midfield support' : 'forward lane pressure'}`,
              })),
              { target: { x: 184, y: profile.riverY + 92 }, description: `${card} central positioning` },
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
  const seen = new Set<string>();
  return [...dynamic, ...opening]
    .flatMap((option) => {
      const target = ownPoint(profile, card, option.target, situation);
      if (!target || seen.has(`${target.x}:${target.y}`)) return [];
      seen.add(`${target.x}:${target.y}`);
      return [{ ...option, target }];
    })
    .slice(0, 5);
}
