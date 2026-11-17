import { match } from 'ts-pattern';

import type { BattleSituation, FieldUnit } from '../battle/battle-state.ts';
import type { TowerHpSnapshot } from '../battle/tower-health.ts';
import { CARD_INFO } from '../cards.ts';
import { COMBAT, PLACEMENT_EFFECTS } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { distance, tilePoint, type Point } from '../geometry.ts';
import { CARD_MECHANICS, UNIT_MECHANICS } from '../knowledge.ts';
import { combatBody, forecastEffect } from '../placement/combat-projection.ts';
import type { Profile } from '../profile.ts';
import type { QwenAction } from './actions.ts';

export type TowerDefenseInput = {
  profile: Profile;
  situation: BattleSituation;
  actions: QwenAction[];
  ownTowerHp?: TowerHpSnapshot[];
  emergences?: Point[];
};
type Threat = {
  source: 'observed_body' | 'observed_graveyard' | 'deployment_clock';
  tower: 'left' | 'right' | 'king';
  x: number;
  y: number;
  kind: string;
  urgency: number;
  covered: number;
  pressure: number;
  ground: boolean | null;
  enemyIndex: number | null;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const targetCoverage = (targets: 'ground' | 'air_and_ground', ground: boolean | null) => {
  if (targets !== 'ground' || ground === true) return 1;
  if (ground === false) return 0;
  return 0.35;
};
const mechanic = (unit: FieldUnit) => {
  const kind = unit.kind ?? unit.card;
  return kind && kind in UNIT_MECHANICS ? UNIT_MECHANICS[kind as keyof typeof UNIT_MECHANICS] : null;
};

// This is a declared proximity/response heuristic, NOT predicted HP damage or
// a claim about an unseen attack target, health, path, pull or guaranteed kill.
export function towerDefense(input: TowerDefenseInput) {
  const bodies = input.situation.opponent.units.map((unit) => combatBody(input.profile, unit));
  const own = input.situation.own.units.map((unit) => combatBody(input.profile, unit));
  const health =
    input.ownTowerHp?.filter(
      (reading) =>
        reading.hp !== null &&
        reading.confirmedAt !== null &&
        input.situation.at >= reading.confirmedAt &&
        input.situation.at - reading.confirmedAt <= 1500,
    ) ?? [];
  const largestHp = Math.max(1, ...health.map((reading) => reading.hp ?? 0));
  const towers = [
    { tower: 'left' as const, x: 3.5, y: 6.5 },
    { tower: 'right' as const, x: 14.5, y: 6.5 },
    { tower: 'king' as const, x: DEPLOYMENT.kingTowerTile[0], y: DEPLOYMENT.kingTowerTile[1] },
  ];
  const threat = (
    point: Point,
    source: Threat['source'],
    kind: string,
    ground: boolean | null,
    enemyIndex: number | null,
    reach: number,
    confidence: number,
  ): Threat => {
    const tower = towers.toSorted((a, b) => distance(point, a) - distance(point, b))[0];
    if (!tower) throw new Error('타워 위치가 없습니다.');
    const hp = health.find((reading) => reading.tower === tower.tower)?.hp;
    const fragility = hp !== null && hp !== undefined ? 1 + (1 - hp / largestHp) * 0.5 : 1;
    const urgency = clamp((8 - Math.max(0, distance(point, tower) - reach)) / 8) * confidence * fragility;
    return {
      source,
      ...point,
      kind,
      ground,
      enemyIndex,
      tower: tower.tower,
      urgency,
      covered: 0,
      pressure: urgency,
    };
  };
  const observed = input.situation.opponent.units.flatMap((unit, index) => {
    if (
      unit.confidence < 0.75 ||
      unit.y < input.profile.riverY - 25 ||
      ['goblin_hut', 'barrel'].includes(unit.kind ?? '')
    )
      return [];
    const body = bodies[index];
    if (!body) return [];
    const reach = mechanic(unit)?.rangeTiles ?? 1.2;
    const point = {
      x: body.x + (body.velocity?.[0] ?? 0) * 1.5,
      y: body.y + (body.velocity?.[1] ?? 0) * 1.5,
    };
    const ground = PLACEMENT_EFFECTS.knownGroundBodies.includes(body.kind)
      ? true
      : (COMBAT.bodies[body.kind]?.ground ?? null);
    const row = threat(point, 'observed_body', body.kind, ground, index, reach, unit.confidence);
    const tower = towers.find((tower) => tower.tower === row.tower);
    const retreating = tower && body.velocity && distance(point, tower) > distance(body, tower) + 1;
    return retreating ? [{ ...row, urgency: row.urgency * 0.25, pressure: row.pressure * 0.25 }] : [row];
  });
  const graves = (input.situation.effects ?? []).flatMap((effect) => {
    if (
      effect.side !== 'red' ||
      effect.card !== 'graveyard' ||
      effect.confidence < 0.8 ||
      effect.y < input.profile.riverY ||
      (effect.onsetCertain && effect.visibleAgeMs >= 9000)
    )
      return [];
    const [x, y] = tilePoint(input.profile, effect);
    return [threat({ x, y }, 'observed_graveyard', 'graveyard', true, null, 4, effect.confidence)];
  });
  const clocks = (input.emergences ?? []).flatMap((point) => {
    if (point.y < input.profile.riverY) return [];
    const [x, y] = tilePoint(input.profile, point);
    if (observed.some((row) => distance(row, { x, y }) < 2.5)) return [];
    return [threat({ x, y }, 'deployment_clock', '?', null, null, 1, 0.65)];
  });
  const assigned = new Map<number, Point[]>();
  const threats = [...observed, ...graves, ...clocks]
    .toSorted((a, b) => b.urgency - a.urgency)
    .map((row) => {
      const defenders = input.situation.own.units.reduce((sum, unit, index) => {
        const body = own[index];
        const info = mechanic(unit);
        if (!body || !info || unit.confidence < 0.75 || distance(body, row) > info.rangeTiles + 0.7)
          return sum;
        const targets = assigned.get(index) ?? [];
        if (
          targets.length >= (info.splashTiles > 0 ? 3 : 1) ||
          targets.some((target) => distance(target, row) > info.splashTiles * 2)
        )
          return sum;
        const targetFactor = targetCoverage(info.targets, row.ground);
        const healthFactor = unit.health && unit.health.maxFraction < 0.15 ? 0.2 : 1;
        assigned.set(index, [...targets, row]);
        const graveFactor = row.source === 'observed_graveyard' && info.splashTiles === 0 ? 0.5 : 1;
        return sum + 0.65 * targetFactor * healthFactor * graveFactor;
      }, 0);
      const pending = input.situation.own.recentPlays.some((play) => {
        if (input.situation.at - play.at > 1600 || !CARD_MECHANICS[play.card]?.body) return false;
        const [x, y] = tilePoint(input.profile, play.target);
        return (
          distance({ x, y }, row) < 3 &&
          !own.some((body) => body.kind === CARD_MECHANICS[play.card]?.body && distance(body, { x, y }) < 2)
        );
      })
        ? 0.5
        : 0;
      const poison =
        row.source === 'observed_graveyard' &&
        (input.situation.effects ?? []).some((effect) => {
          if (
            effect.side !== 'blue' ||
            effect.card !== 'poison' ||
            (effect.onsetCertain && effect.visibleAgeMs >= 7500)
          )
            return false;
          const [x, y] = tilePoint(input.profile, effect);
          return distance({ x, y }, row) < 3;
        })
          ? 0.8
          : 0;
      const covered = Math.min(0.85, defenders + pending + poison);
      return { ...row, covered, pressure: row.urgency * (1 - covered) };
    })
    .filter((row) => row.urgency > 0.05);
  const pressure = threats.reduce((sum, row) => sum + row.pressure, 0);

  const coverage = (action: QwenAction, row: Threat, forecast: ReturnType<typeof forecastEffect>) => {
    if (!action.card || action.kind === 'ability') return 0;
    const [x, y] = tilePoint(input.profile, action.target);
    if (y > 16) return 0;
    const gap = distance({ x, y }, row);
    if (row.source === 'deployment_clock' && action.card === 'skeletons') return 0;
    if (
      row.kind === 'goblin_drill' &&
      action.card === 'skeletons' &&
      (input.emergences ?? []).some((point) => {
        const [cx, cy] = tilePoint(input.profile, point);
        return distance({ x: cx, y: cy }, row) < 3;
      })
    )
      return 0;
    if (action.card === 'graveyard') return 0;
    if (action.card === 'poison') {
      if (row.source === 'observed_graveyard') return gap < 3 ? 0.9 : 0;
      const hit = forecast.targets.find((target) => target.index === row.enemyIndex);
      if (!hit || hit.trajectoryDamage <= 0) return 0;
      return hit.kill === 'yes' ? 0.9 : 0.3;
    }
    if (action.card === 'barbarian_barrel') {
      if (row.ground !== true) return 0;
      const hit = forecast.targets.find((target) => target.index === row.enemyIndex);
      return hit && hit.trajectoryDamage > 0 ? 0.7 : 0;
    }
    if (action.card === 'goblin_hut') return gap < 6 ? 0.2 : 0;
    const body = CARD_MECHANICS[action.card]?.body;
    const info = body ? UNIT_MECHANICS[body] : null;
    if (!info) return 0;
    const targetFactor = targetCoverage(info.targets, row.ground);
    const graveFactor = row.source === 'observed_graveyard' && info.targets === 'ground' ? 0.5 : 1;
    return gap <= info.rangeTiles + 0.7 ? 0.8 * targetFactor * graveFactor : 0;
  };
  const actions = input.actions.map((action) => {
    const [x, y] = tilePoint(input.profile, action.target);
    const forecast = forecastEffect({
      card: action.card,
      kind: action.kind ?? (action.card ? 'card' : 'wait'),
      x,
      y,
      own,
      enemy: bodies,
      enemyCycle: [],
      enemyMana: input.situation.opponent.elixir,
    });
    const rawResponse = threats.map((row) => coverage(action, row, forecast));
    const capacity = match(action.card)
      .with('skeletons', () => 3)
      .with('knight', 'furnace', 'goblin_hut', () => 1)
      .otherwise(() => threats.length);
    const responding = new Set(
      threats
        .map((row, index) => ({ index, value: row.pressure * (rawResponse[index] ?? 0) }))
        .filter((row) => row.value > 0)
        .toSorted((a, b) => b.value - a.value)
        .slice(0, capacity)
        .map((row) => row.index),
    );
    const response = rawResponse.map((value, index) => (responding.has(index) ? value : 0));
    const benefit = threats.reduce(
      (sum, row, index) => sum + row.pressure * (response[index] ?? 0) * Math.min(1, row.pressure / 0.5),
      0,
    );
    const cost = action.card ? (action.cost ?? CARD_INFO[action.card].cost) : 0;
    const stranded = threats.reduce(
      (sum, row, index) => sum + ((response[index] ?? 0) < 0.2 ? row.pressure : 0),
      0,
    );
    const reservePenalty = action.card && input.situation.own.elixir.min - cost < 3 ? stranded * 2 : 0;
    return {
      id: action.id,
      response: benefit,
      bias: pressure > 0 ? -8 * pressure + 18 * benefit - cost * 0.65 - reservePenalty : 0,
    };
  });
  return {
    basis: 'observed_tower_pressure_and_response' as const,
    towerHpKnown: health.length,
    pressure,
    urgent: threats.some((row) => row.pressure >= 0.45),
    threats,
    actions,
  };
}
