import { minBy } from 'es-toolkit';

import { bodyVector, CARD_CATALOGUE, catalogueCard } from '../card-catalogue.ts';
import { COMBAT } from '../combat-reference.ts';
import { possiblePrincessTowers } from '../placement/combat-motion.ts';
import type { CombatBody } from '../placement/combat-projection.ts';
import type { DecisionAction, DecisionContext } from '../policy/decision-v3.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

const tags = CARD_CATALOGUE.bodyFeatures;
const moving = tags.indexOf('speed');
const buildingsOnly = tags.indexOf('buildingTargets');
const building = tags.indexOf('building');

export function chasesBuildings(body: CombatBody) {
  const traits = bodyVector(body.kind);
  return traits[buildingsOnly] === 1 && (traits[moving] ?? 0) > 0;
}

export function hogThreat(body: CombatBody) {
  return ['hog_rider', 'royal_hog'].includes(body.kind) && body.y <= FAST_TACTICS.hogPull.triggerY;
}

export function royalGiantThreat(body: CombatBody) {
  return body.kind === 'royal_giant' && body.y <= FAST_TACTICS.royalGiantPull.triggerY;
}

const standingTowers = (context: DecisionContext) =>
  possiblePrincessTowers(context.towers?.own, context.fallenTowers?.own);

export const towersCovering = (context: DecisionContext, x: number, y: number) =>
  standingTowers(context).filter(
    (tower) => Math.hypot(tower.x - x, tower.y - y) <= FAST_TACTICS.buildingPull.towerRange,
  ).length;

function siegeArrival(
  context: DecisionContext,
  body: CombatBody,
  spec: { speed: number; towerContact: number },
) {
  const tower = minBy(standingTowers(context), (tower) => Math.hypot(body.x - tower.x, body.y - tower.y));
  if (!tower) return null;
  const dx = tower.x - body.x;
  const dy = tower.y - body.y;
  const distance = Math.hypot(dx, dy);
  const delay = COMBAT.inputDelaySeconds + FAST_TACTICS.hogPull.deploySeconds;
  // Use running speed for a newly observed Hog. A slow sample can be the
  // deployment/jump animation and must not extend the time before it locks on.
  const travel = spec.speed * delay;
  if (distance <= travel + spec.towerContact + FAST_TACTICS.hogPull.distanceMargin) return null;
  return { x: body.x + (dx * travel) / distance, y: body.y + (dy * travel) / distance };
}

function pullValue(context: DecisionContext, approach: { x: number; y: number }, x: number, y: number) {
  if (y <= 6.5 || y >= 16) return 0;
  const standing = standingTowers(context);
  if (!standing.length) return 0;
  const distance = Math.hypot(x - approach.x, y - approach.y);
  if (distance >= Math.min(...standing.map((t) => Math.hypot(t.x - approach.x, t.y - approach.y)))) return 0;
  const firing = towersCovering(context, x, y);
  if (!firing) return 0;
  return (
    Math.max(0, 1 - distance / FAST_TACTICS.buildingPull.maxDistance) *
    (firing === 2 ? 1 : FAST_TACTICS.buildingPull.oneTowerCoverage)
  );
}

export function alreadyPulled(context: DecisionContext, approach: { x: number; y: number }) {
  return context.bodies.own.some(
    (body) => bodyVector(body.kind)[building] === 1 && pullValue(context, approach, body.x, body.y) >= 0.4,
  );
}

export function towerPull(
  context: DecisionContext,
  action: DecisionAction,
  approach: { x: number; y: number },
  body?: CombatBody,
) {
  if (catalogueCard(action[2])?.placement !== 'building') return 0;
  if (!body || !['hog_rider', 'royal_hog', 'royal_giant'].includes(body.kind))
    return pullValue(context, approach, action[4], action[5]);
  const spec = FAST_TACTICS.hogPull;
  const x = action[4];
  const y = action[5];
  if (
    !(hogThreat(body) || royalGiantThreat(body)) ||
    Math.abs(x - 9) > spec.centerWidth ||
    y < spec.minY ||
    y > spec.maxY
  )
    return 0;
  const stats =
    body.kind === 'royal_hog'
      ? { speed: spec.speed, towerContact: spec.royalHogTowerContact }
      : hogThreat(body)
        ? spec
        : FAST_TACTICS.royalGiantPull;
  const ready = siegeArrival(context, body, stats);
  if (!ready) return 0;
  const distance = Math.hypot(x - ready.x, y - ready.y);
  const standing = standingTowers(context);
  if (
    distance + spec.distanceMargin >=
    Math.min(...standing.map((tower) => Math.hypot(tower.x - ready.x, tower.y - ready.y)))
  )
    return 0;
  const cover = pullValue(context, ready, x, y);
  return cover > 0 ? 0.4 + 0.6 * cover : 0;
}
