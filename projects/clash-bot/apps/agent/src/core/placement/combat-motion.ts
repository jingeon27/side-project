import { minBy } from 'es-toolkit';

import { COMBAT } from '../combat-reference.ts';
import type { CombatBody } from './combat-projection.ts';

export function possiblePrincessTowers(health?: number[], fallen?: number[]) {
  return [
    { x: 3.5, y: 6.5 },
    { x: 14.5, y: 6.5 },
  ].filter((_, i) => health?.[i + 1] !== 0 && !fallen?.includes(i));
}

export function motionPosition(unit: CombatBody, time: number) {
  return {
    x: unit.x + (unit.velocity?.[0] ?? 0) * time,
    y: unit.y + (unit.velocity?.[1] ?? 0) * time,
  };
}

export function poisonPosition(unit: CombatBody, time: number, x: number, y: number, delay: number) {
  if (!unit.velocity) return motionPosition(unit, time);
  const [vx, vy] = unit.velocity;
  const a = vx * vx + vy * vy;
  const b = 2 * ((unit.x - x) * vx + (unit.y - y) * vy);
  const c = (unit.x - x) ** 2 + (unit.y - y) ** 2 - COMBAT.poison.radius ** 2;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant < 0) return motionPosition(unit, time);
  const enter = Math.max(delay, (-b - Math.sqrt(discriminant)) / (2 * a));
  const exit = (-b + Math.sqrt(discriminant)) / (2 * a);
  if (exit <= enter || time <= enter) return motionPosition(unit, time);
  const until = enter + (exit - enter) / COMBAT.poison.slowMultiplier;
  return motionPosition(
    unit,
    time <= until ? enter + (time - enter) * COMBAT.poison.slowMultiplier : exit + time - until,
  );
}

export function firecrackerRecoil(unit: CombatBody, targets: ReadonlyArray<Pick<CombatBody, 'x' | 'y'>>) {
  if (unit.kind !== 'firecracker') return null;
  const setup = COMBAT.firecrackerRecoil;
  const firing = motionPosition(unit, setup.windupSeconds);
  const target = minBy(targets, (target) => Math.hypot(firing.x - target.x, firing.y - target.y));
  if (!target) return null;
  const distance = Math.hypot(firing.x - target.x, firing.y - target.y);
  if (distance === 0 || distance > setup.attackRangeTiles) return null;
  return {
    x: (setup.distanceTiles * (firing.x - target.x)) / distance,
    y: (setup.distanceTiles * (firing.y - target.y)) / distance,
  };
}

export function recoilPosition(
  point: { x: number; y: number },
  time: number,
  recoil: ReturnType<typeof firecrackerRecoil>,
) {
  if (!recoil || time < COMBAT.firecrackerRecoil.windupSeconds) return point;
  return {
    x: Math.min(17.5, Math.max(0.5, point.x + recoil.x)),
    y: Math.min(31.5, Math.max(0.5, point.y + recoil.y)),
  };
}
