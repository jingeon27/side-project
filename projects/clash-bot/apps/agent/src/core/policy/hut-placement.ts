import { distance, screenPoint, tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import { combatBody } from './combat-projection.ts';
import { graveyardThreat, ownPoint, type PlacementField, type PlacementOption } from './placement.ts';

// The frozen controller 1 retains unitPlacements. The candidate's physical
// option generator can improve without silently rewriting its comparator.
export function hutPlacements(profile: Profile, situation: PlacementField): PlacementOption[] {
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
