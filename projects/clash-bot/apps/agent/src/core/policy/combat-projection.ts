import { match } from 'ts-pattern';

import type { FieldUnit } from '../battle/battle-state.ts';
import { COMBAT } from '../combat-reference.ts';
import { tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';

export type CombatBody = {
  kind: string;
  x: number;
  y: number;
  variant: string;
  velocity: [number, number] | null;
  hp: [number, number] | null;
};
export type EffectForecast = {
  basis: 'reference_motion_projection';
  damage: [number, number];
  exposureSeconds: [number, number];
  kills: [number, number];
  unknownHealth: number;
  opportunity: number;
  reserveBarrel: boolean;
  trajectoryDamage: number;
  targets: Array<{
    index: number;
    damage: [number, number];
    potentialDamage: [number, number];
    exposureSeconds: [number, number];
    hp: [number, number] | null;
    kill: 'yes' | 'no' | 'possible' | 'unknown';
    trajectoryDamage: number;
  }>;
};

export function combatBody(profile: Pick<Profile, 'riverY'>, unit: FieldUnit): CombatBody {
  const point = tilePoint(profile, unit);
  const velocity =
    unit.velocity && unit.motion && unit.motion.samples >= 2 && unit.motion.elapsedMs >= 100
      ? ([(unit.velocity.xPerSecond * 11) / 178, (-unit.velocity.yPerSecond * 9.5) / 130] as [number, number])
      : null;
  const kind = unit.kind ?? unit.card ?? '?';
  const reference = COMBAT.bodies[kind];
  return {
    kind,
    x: point[0],
    y: point[1],
    variant: unit.variant ?? 'unknown',
    velocity,
    hp:
      unit.health && reference
        ? [
            Math.floor(reference.hp * unit.health.minFraction),
            Math.ceil(reference.hp * unit.health.maxFraction),
          ]
        : null,
  };
}

const classifyKill = (
  hp: [number, number] | null,
  damage: [number, number],
): EffectForecast['targets'][number]['kill'] => {
  if (hp === null) return 'unknown';
  if (damage[0] >= hp[1]) return 'yes';
  if (damage[1] < hp[0]) return 'no';
  return 'possible';
};

const round = (value: number) => Math.round(value * 10) / 10;
const position = (unit: CombatBody, time: number) => ({
  x: unit.x + (unit.velocity?.[0] ?? 0) * time,
  y: unit.y + (unit.velocity?.[1] ?? 0) * time,
});
function poisonPosition(unit: CombatBody, time: number, x: number, y: number, delay: number) {
  if (!unit.velocity) return position(unit, time);
  const [vx, vy] = unit.velocity;
  const a = vx * vx + vy * vy;
  const b = 2 * ((unit.x - x) * vx + (unit.y - y) * vy);
  const c = (unit.x - x) ** 2 + (unit.y - y) ** 2 - COMBAT.poison.radius ** 2;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant < 0) return position(unit, time);
  const enter = Math.max(delay, (-b - Math.sqrt(discriminant)) / (2 * a));
  const exit = (-b + Math.sqrt(discriminant)) / (2 * a);
  if (exit <= enter || time <= enter) return position(unit, time);
  const until = enter + (exit - enter) / COMBAT.poison.slowMultiplier;
  return position(
    unit,
    time <= until ? enter + (time - enter) * COMBAT.poison.slowMultiplier : exit + time - until,
  );
}
const uncertainty = (unit: CombatBody, time: number) => {
  if (COMBAT.bodies[unit.kind]?.speed === 0) return COMBAT.positionUncertaintyTiles;
  const speed = unit.velocity ? COMBAT.turnUncertaintyTilesPerSecond : (COMBAT.bodies[unit.kind]?.speed ?? 2);
  return COMBAT.positionUncertaintyTiles + time * speed;
};

// Model intervals describe movement/aim scenarios, not a calibrated probability
// or a claim that an unseen body is stationary, alive, marked or at full health.
export function forecastEffect(input: {
  card: string | null;
  kind: string;
  x: number;
  y: number;
  own: CombatBody[];
  enemy: CombatBody[];
  enemyCycle: Array<[string, number, number]>;
  enemyMana: { min: number; max: number };
}): EffectForecast {
  const reserveBarrel =
    input.enemyCycle.some(([card, min]) => card === 'goblin_barrel' && min === 0) && input.enemyMana.max >= 3;
  const opportunity =
    input.kind === 'ability'
      ? input.enemy.filter(
          (enemy) =>
            enemy.kind !== 'barrel' &&
            input.own.some(
              (own) =>
                own.kind === 'ice_wizard' &&
                Math.hypot(own.x - enemy.x, own.y - enemy.y) <= COMBAT.ability.markRange,
            ),
        ).length
      : 0;
  const empty: EffectForecast = {
    basis: 'reference_motion_projection',
    damage: [0, 0],
    exposureSeconds: [0, 0],
    kills: [0, 0],
    unknownHealth: 0,
    opportunity,
    reserveBarrel,
    trajectoryDamage: 0,
    targets: [],
  };
  if (input.kind === 'ability' || !['ice_wizard', 'barbarian_barrel', 'poison'].includes(input.card ?? ''))
    return empty;
  const targets = input.enemy.flatMap((unit, index) => {
    if (unit.kind === 'barrel') return [];
    const reference = COMBAT.bodies[unit.kind];
    if (input.card === 'barbarian_barrel' && !reference?.ground) return [];
    const delay =
      COMBAT.inputDelaySeconds +
      match(input.card)
        .with('ice_wizard', () => COMBAT.ice_wizard.deploySeconds)
        .with('poison', () => COMBAT.poison.deploySeconds)
        .otherwise(() => COMBAT.barbarian_barrel.deploySeconds);
    const duration =
      input.card === 'poison'
        ? COMBAT.poison.duration
        : COMBAT.barbarian_barrel.length / COMBAT.barbarian_barrel.speed;
    const times =
      input.card === 'ice_wizard'
        ? [delay]
        : Array.from(
            { length: Math.ceil(duration / COMBAT.stepSeconds) + 1 },
            (_, i) => delay + i * COMBAT.stepSeconds,
          );
    const hits = times.map((time) => {
      const point =
        input.card === 'poison' ? poisonPosition(unit, time, input.x, input.y, delay) : position(unit, time);
      const radius =
        uncertainty(unit, time) +
        COMBAT.inputDelayUncertainty * Math.hypot(...(unit.velocity ?? [reference?.speed ?? 2, 0]));
      if (input.card === 'barbarian_barrel') {
        const rollY = input.y + (time - delay) * COMBAT.barbarian_barrel.speed;
        const dx = Math.abs(point.x - input.x) - COMBAT.barbarian_barrel.width / 2;
        const dy = Math.abs(point.y - rollY) - COMBAT.barbarian_barrel.width / 2;
        return [dx + radius <= 0 && dy + radius <= 0, dx - radius <= 0 && dy - radius <= 0];
      }
      const positions = input.card === 'poison' ? [point, position(unit, time)] : [point];
      const range = input.card === 'poison' ? COMBAT.poison.radius : COMBAT.ice_wizard.radius;
      return [
        positions.every(
          (candidate) => Math.hypot(candidate.x - input.x, candidate.y - input.y) + radius <= range,
        ),
        positions.some(
          (candidate) => Math.hypot(candidate.x - input.x, candidate.y - input.y) - radius <= range,
        ),
      ];
    });
    const central = times.map((time) => {
      if (
        input.card === 'poison' &&
        reference?.speed !== 0 &&
        (unit.velocity === null || time > delay + COMBAT.poison.trajectoryHorizonSeconds)
      )
        return false;
      const point =
        input.card === 'poison' ? poisonPosition(unit, time, input.x, input.y, delay) : position(unit, time);
      if (input.card === 'barbarian_barrel')
        return (
          Math.abs(point.x - input.x) <= COMBAT.barbarian_barrel.width / 2 &&
          Math.abs(point.y - input.y - (time - delay) * COMBAT.barbarian_barrel.speed) <=
            COMBAT.barbarian_barrel.width / 2
        );
      return (
        Math.hypot(point.x - input.x, point.y - input.y) <=
        (input.card === 'poison' ? COMBAT.poison.radius : COMBAT.ice_wizard.radius)
      );
    });
    const trajectoryPotential = () => {
      if (input.card === 'poison')
        return (
          Math.min(
            8,
            Math.floor((central.filter(Boolean).length * COMBAT.stepSeconds) / COMBAT.poison.tickSeconds),
          ) * COMBAT.poison.dps
        );
      if (!central.some(Boolean)) return 0;
      return input.card === 'ice_wizard' ? COMBAT.ice_wizard.damage : COMBAT.barbarian_barrel.damage;
    };
    const trajectoryDamage = trajectoryPotential();
    const exposure: [number, number] =
      input.card === 'poison'
        ? [
            Math.min(8, hits.filter(([sure]) => sure).length * COMBAT.stepSeconds),
            Math.min(8, hits.filter(([, possible]) => possible).length * COMBAT.stepSeconds),
          ]
        : [0, 0];
    const baseDamage = match(input.card)
      .with('poison', () => null)
      .with('ice_wizard', () => COMBAT.ice_wizard.damage)
      .otherwise(() => COMBAT.barbarian_barrel.damage);
    const amount: [number, number] =
      baseDamage === null
        ? [
            Math.floor(exposure[0] / COMBAT.poison.tickSeconds) * COMBAT.poison.dps,
            Math.min(8, Math.ceil(exposure[1] / COMBAT.poison.tickSeconds)) * COMBAT.poison.dps,
          ]
        : [
            hits.some(([sure]) => sure) ? baseDamage : 0,
            hits.some(([, possible]) => possible) ? baseDamage : 0,
          ];
    const damage: [number, number] = [
      unit.kind === 'knight' && unit.variant !== 'base' ? Math.floor(amount[0] * 0.4) : amount[0],
      amount[1],
    ];
    if (damage[1] === 0) return [];
    const kill = classifyKill(unit.hp, damage);
    const actual: [number, number] = unit.hp
      ? [Math.min(damage[0], unit.hp[0]), Math.min(damage[1], unit.hp[1])]
      : [0, damage[1]];
    return [
      {
        index,
        damage: actual,
        potentialDamage: damage,
        exposureSeconds: exposure.map(round) as [number, number],
        hp: unit.hp,
        kill,
        trajectoryDamage,
      },
    ];
  });
  return {
    ...empty,
    targets,
    damage: [
      targets.reduce((sum, t) => sum + t.damage[0], 0),
      targets.reduce((sum, t) => sum + t.damage[1], 0),
    ],
    exposureSeconds: [
      round(targets.reduce((sum, t) => sum + t.exposureSeconds[0], 0)),
      round(targets.reduce((sum, t) => sum + t.exposureSeconds[1], 0)),
    ],
    kills: [
      targets.filter((t) => t.kill === 'yes').length,
      targets.filter((t) => t.kill === 'yes' || t.kill === 'possible').length,
    ],
    unknownHealth: targets.filter((t) => t.kill === 'unknown').length,
    opportunity: targets.filter((target) => target.trajectoryDamage > 0).length,
    trajectoryDamage: targets.reduce((sum, target) => sum + target.trajectoryDamage, 0),
  };
}

export function forecastText(forecast: EffectForecast, kind: string, card: string | null) {
  if (kind === 'ability') return `q${forecast.opportunity}`;
  if (!['ice_wizard', 'barbarian_barrel', 'poison'].includes(card ?? '')) return '';
  const interval = ([low, high]: [number, number]) => (low === high ? String(low) : `${low}-${high}`);
  return (
    (forecast.damage[1] === 0
      ? 'z'
      : `d${interval(forecast.damage)}k${interval(forecast.kills)}${forecast.unknownHealth ? '?' : ''}`) +
    (card === 'poison' && forecast.damage[1] > 0 ? `e${interval(forecast.exposureSeconds)}` : '') +
    (card === 'poison' ? `n${forecast.trajectoryDamage}` : '') +
    (card === 'barbarian_barrel' ? `q${forecast.opportunity}r${Number(forecast.reserveBarrel)}` : '')
  );
}
