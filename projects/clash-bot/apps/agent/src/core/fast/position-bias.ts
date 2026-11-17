import { COMBAT } from '../combat-reference.ts';
import type { DecisionAction, DecisionContext } from '../policy/decision-v3.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

// Declared staging/pull geometry, not a fixed spawn point or learned placement skill.
export function positionBias(context: DecisionContext, action: DecisionAction) {
  const card = action[2],
    x = action[4],
    y = action[5];
  const p = FAST_TACTICS.positions;
  if (card === 'goblin_hut') {
    const huts = context.bodies.own.filter((b) => b.kind === 'goblin_hut');
    const coverage = context.bodies.enemy.filter(
      (b) =>
        b.y < 18 &&
        COMBAT.bodies[b.kind]?.speed !== 0 &&
        Math.hypot(b.x - x, b.y - y) <= 6 &&
        !huts.some((h) => Math.hypot(b.x - h.x, b.y - h.y) <= 6),
    ).length;
    const stacked = huts.some((h) => Math.hypot(x - h.x, y - h.y) < 6);
    const poison = context.effects?.some(
      (e) =>
        e[0] === 'red' &&
        e[1] === 'poison' &&
        (e[4] === null || e[4] < 8) &&
        Math.hypot(x - e[2], y - e[3]) < COMBAT.poison.radius + 0.7,
    );
    return (
      coverage * p.hutCoverageWeight -
      Math.abs(x - p.hutX) * p.hutXWeight -
      Math.abs(y - p.hutY) * p.hutYWeight -
      Math.max(0, y - p.hutFrontY) * p.hutFrontWeight +
      (stacked ? COMBAT.policy.redundantHut : 0) +
      (poison ? p.hutPoisonWeight : 0)
    );
  }
  if (!['knight', 'furnace', 'ice_wizard', 'skeletons'].includes(card ?? '')) return 0;
  const urgent =
    context.deployments.length > 0 ||
    context.bodies.enemy.some((b) => b.y < 18) ||
    context.effects?.some((e) => e[0] === 'red' && e[1] === 'graveyard');
  const supported = context.bodies.own.some((b) => b.y > 16 && Math.abs(b.x - x) < 4.5);
  if (urgent || supported) return 0;
  return (
    (-Math.max(0, y - p.stagingY) * p.frontWeight) / 4 -
    Math.min(...[3.5, 14.5, 8, 10].map((lane) => Math.abs(x - lane))) * p.laneWeight
  );
}
