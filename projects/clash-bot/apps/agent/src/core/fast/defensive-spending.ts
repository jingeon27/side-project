import { COMBAT } from '../combat-reference.ts';
import { motionPosition } from '../placement/combat-motion.ts';
import type { EffectForecast } from '../placement/combat-projection.ts';
import type { DecisionAction, DecisionContext } from '../policy/decision-v3.ts';
import type { fastDefense } from './defense.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

export function openingIceWizardHasValue(
  context: DecisionContext,
  action: DecisionAction,
  projection: EffectForecast,
) {
  const opening = FAST_TACTICS.iceWizardOpening;
  if ((context.clock ?? 0) >= opening.seconds || action[5] < opening.frontY) return true;
  const contacts = projection.targets.filter((target) => target.trajectoryDamage > 0);
  if (contacts.length >= 2) return true;
  return contacts.some(({ index }) => {
    const body = context.bodies.enemy[index];
    return (
      !!body &&
      motionPosition(body, COMBAT.inputDelaySeconds + COMBAT.ice_wizard.deploySeconds).y <= opening.urgentY
    );
  });
}

export function worthwhileBarrel(
  context: DecisionContext,
  action: DecisionAction,
  projection: EffectForecast,
  defense: ReturnType<typeof fastDefense>,
) {
  const urgent = defense.benefit >= FAST_TACTICS.urgentDefenseValue;
  if (projection.reserveBarrel && !urgent) return false;
  const x = action[4];
  const y = action[5];
  const hits = projection.targets.flatMap((target) => {
    const body = context.bodies.enemy[target.index];
    return target.trajectoryDamage > 0 && body ? [{ target, body }] : [];
  });
  const end = y + COMBAT.barbarian_barrel.length;
  const drills = context.bodies.enemy.filter((body) => body.kind === 'goblin_drill' && body.y < 16);
  const drillLanding = drills.some(
    (drill) =>
      drill.y > y &&
      Math.abs(drill.x - x) <= COMBAT.barbarian_barrel.width / 2 + COMBAT.positionUncertaintyTiles &&
      Math.hypot(drill.x - x, drill.y - end) <= 2.25 &&
      defense.intercept >= 0.35,
  );
  const threatenedCrowns = [3.5, 14.5].filter((_, i) => {
    const hp = context.towers?.own[i + 1];
    return hp !== undefined && hp > 0 && hp <= 0.12;
  });
  if (drillLanding) return true;
  if (
    defense.unansweredDrill &&
    !hits.some(({ body }) => drills.some((drill) => Math.hypot(body.x - drill.x, body.y - drill.y) <= 3.5))
  )
    return false;
  if (hits.length >= 2) return true;
  return hits.some(({ target, body }) => {
    if (body.kind === 'goblin_drill')
      return target.hp !== null && target.hp[1] <= COMBAT.barbarian_barrel.damage;
    const graveyard = context.effects?.some(
      ([side, card, gx, gy]) =>
        side === 'red' &&
        card === 'graveyard' &&
        Math.hypot(body.x - gx, body.y - gy) <= COMBAT.policy.graveyardSpawnRadius,
    );
    if (FAST_TACTICS.fragileBodies.includes(body.kind))
      return (
        !!graveyard ||
        drills.some((drill) => Math.hypot(body.x - drill.x, body.y - drill.y) <= 3.5) ||
        threatenedCrowns.some((lane) => Math.hypot(body.x - lane, body.y - 6.5) <= 2.5)
      );
    const lethal = target.hp !== null && target.hp[1] <= COMBAT.barbarian_barrel.damage;
    if (body.kind === 'firecracker') return lethal || defense.intercept >= 0.3;
    return defense.usefulRoll && (urgent || lethal);
  });
}
