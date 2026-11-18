import { match } from 'ts-pattern';

import { bodyVector, CARD_CATALOGUE, catalogueCard } from '../card-catalogue.ts';
import { COMBAT, referenceBodyHp, referenceBodySpeed } from '../combat-reference.ts';
import type { CombatBody, EffectForecast } from '../placement/combat-projection.ts';
import type { DecisionAction, DecisionContext } from '../policy/decision-v3.ts';
import { graveyardDefense } from './graveyard.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

const distance = (x: number, y: number, body: Pick<CombatBody, 'x' | 'y'>) =>
  Math.hypot(x - body.x, y - body.y);
const future = (body: CombatBody, seconds = FAST_TACTICS.responseSeconds) => ({
  x: body.x + (body.velocity?.[0] ?? 0) * seconds,
  y: body.y + (body.velocity?.[1] ?? 0) * seconds,
});
const responds = (action: DecisionAction, point: Pick<CombatBody, 'x' | 'y'>) =>
  Math.max(
    0,
    1 -
      distance(action[4], action[5], point) /
        (action[2] === 'ice_wizard' ? 5 : FAST_TACTICS.engagementRadius),
  );
const durableFirecracker = (body: CombatBody) =>
  body.kind === 'firecracker' && (body.hp === null || body.hp[1] > COMBAT.barbarian_barrel.damage);

function canRespond(card: string | null, body: CombatBody) {
  const features = catalogueCard(card)?.features;
  if (!features) return false;
  if (features[CARD_CATALOGUE.cardFeatures.indexOf('spell')] === 1) return true;
  const flying = bodyVector(body.kind)[CARD_CATALOGUE.bodyFeatures.indexOf('flying')] === 1;
  return (features[CARD_CATALOGUE.cardFeatures.indexOf(flying ? 'airTargets' : 'groundTargets')] ?? 0) > 0;
}

// A response belongs to THIS target. Hitting an unrelated unit never covers a Drill.
export function fastDefense(context: DecisionContext, action: DecisionAction, projection: EffectForecast) {
  // A visible spawner's clock can time the next child. It does not put its
  // already observed body back into a pre-emergence phase.
  const deployments = context.deployments.filter(
    ([x, y]) =>
      !context.bodies.enemy.some(
        (body) => ['goblin_drill', 'goblin_hut'].includes(body.kind) && distance(x, y, body) < 3,
      ),
  );
  const grave = graveyardDefense(context, action);
  const threats = context.bodies.enemy.flatMap((body, index) => {
    if (['barrel', 'goblin_hut'].includes(body.kind) || future(body).y >= FAST_TACTICS.threatBoundary)
      return [];
    if (
      body.kind !== 'goblin_drill' &&
      context.bodies.own.some((own) => distance(own.x, own.y, body) < FAST_TACTICS.engagementRadius)
    )
      return [];
    const knightCover =
      body.kind === 'goblin_drill' &&
      context.bodies.own.some(
        (own) =>
          own.kind === 'knight' &&
          distance(own.x, own.y, body) < 2.5 &&
          (own.hp === null || own.hp[1] > referenceBodyHp('knight') * 0.15),
      );
    const pressure =
      body.kind === 'goblin_drill'
        ? FAST_TACTICS.drillPriority * (knightCover ? 0.35 : 1)
        : Math.min(1, Math.max(0, (FAST_TACTICS.threatBoundary - future(body).y) / 8));
    return [{ body, index, pressure }];
  });
  const intercept = (body: CombatBody) => {
    if (body.kind === 'goblin_drill') {
      if (
        deployments.some(([x, y]) => distance(x, y, body) < 3.5) ||
        context.bodies.own.some((own) => own.kind === 'knight' && distance(own.x, own.y, body) < 2.5)
      )
        return 0;
      // Only the landing Barbarian's possible defense is credited. Unknown HP never
      // turns rolling damage into a guaranteed Drill/death-spawn cleanup.
      const walkingReach = referenceBodySpeed('barbarian') * FAST_TACTICS.responseSeconds;
      return (
        FAST_TACTICS.drillBarbarianResponse *
        Math.max(
          0,
          1 -
            Math.max(
              0,
              distance(action[4], action[5] + COMBAT.barbarian_barrel.length, body) - walkingReach,
            ) /
              FAST_TACTICS.engagementRadius,
        )
      );
    }
    if (!COMBAT.bodies[body.kind]?.ground) return 0;
    const landing =
      COMBAT.inputDelaySeconds +
      COMBAT.barbarian_barrel.deploySeconds +
      COMBAT.barbarian_barrel.length / COMBAT.barbarian_barrel.speed;
    const catchScore = Math.max(
      0,
      1 -
        distance(action[4], action[5] + COMBAT.barbarian_barrel.length, future(body, landing)) /
          FAST_TACTICS.engagementRadius,
    );
    return durableFirecracker(body) ? catchScore * 0.4 : catchScore;
  };
  const usefulRoll = projection.targets.some(
    (hit) =>
      hit.trajectoryDamage > 0 &&
      (context.bodies.enemy[hit.index]?.kind !== 'goblin_drill' ||
        (hit.hp !== null && hit.hp[1] <= COMBAT.barbarian_barrel.damage)),
  );
  const troopResponse = ({ body, index }: (typeof threats)[number]) => {
    const hit = projection.targets.find((target) => target.index === index);
    return match(action[2])
      .with('barbarian_barrel', () => {
        if (body.kind === 'goblin_drill') {
          const cleanup =
            hit && hit.trajectoryDamage > 0 && hit.hp !== null && hit.hp[1] <= COMBAT.barbarian_barrel.damage;
          const goblins = projection.targets.some((child) => {
            const goblin = context.bodies.enemy[child.index];
            return (
              child.trajectoryDamage > 0 &&
              goblin?.kind === 'goblin' &&
              distance(body.x, body.y, goblin) < 3.5
            );
          });
          return cleanup || goblins ? 1 : intercept(body);
        }
        const direct = hit && hit.trajectoryDamage > 0 ? 1 : 0;
        return Math.max(direct * (durableFirecracker(body) ? 0.35 : 1), intercept(body));
      })
      .with('poison', () => (hit && hit.trajectoryDamage > 0 ? (hit.kill === 'yes' ? 0.9 : 0.3) : 0))
      .with('goblin_hut', () => responds(action, future(body)) * 0.2)
      .otherwise(() =>
        action[2] !== 'graveyard' && canRespond(action[2], body) ? responds(action, future(body)) : 0,
      );
  };
  const pendingResponse =
    action[2] === 'graveyard' ||
    action[2] === 'poison' ||
    action[2] === 'barbarian_barrel' ||
    action[2] === 'skeletons'
      ? 0
      : Math.max(0, ...deployments.map(([x, y]) => responds(action, { x, y })));
  const pressure = Math.max(
    0,
    grave.pressure,
    deployments.length ? FAST_TACTICS.deploymentPriority : 0,
    ...threats.map((t) => t.pressure),
  );
  const benefit = Math.max(
    0,
    grave.response,
    pendingResponse * FAST_TACTICS.deploymentPriority,
    ...threats.map((t) => t.pressure * troopResponse(t)),
  );
  const drillKnight =
    action[2] === 'knight'
      ? Math.max(
          0,
          ...threats
            .filter((t) => t.body.kind === 'goblin_drill')
            .map((t) =>
              context.bodies.own.some((own) => own.kind === 'knight' && distance(own.x, own.y, t.body) < 2.5)
                ? 0
                : responds(action, t.body),
            ),
        )
      : 0;
  const prematureSkeletons =
    action[2] === 'skeletons' && deployments.some(([x, y]) => distance(action[4], action[5], { x, y }) < 4);
  const unansweredDrill =
    threats.some(
      (t) =>
        t.body.kind === 'goblin_drill' && t.pressure >= FAST_TACTICS.drillPriority && troopResponse(t) < 0.2,
    ) ||
    (deployments.length > 0 && pendingResponse < 0.2);
  const contact =
    action[2] === 'barbarian_barrel' && !unansweredDrill
      ? Math.max(
          0,
          ...threats.map((t) => {
            const hit = projection.targets.find((target) => target.index === t.index);
            if (!hit || durableFirecracker(t.body)) return 0;
            const lethal = hit.hp !== null && hit.hp[1] <= COMBAT.barbarian_barrel.damage;
            const followup = lethal ? 1 : Math.max(0.2, intercept(t.body));
            return Math.min(1, t.pressure) * hit.trajectoryQuality * followup;
          }),
        )
      : 0;
  return {
    bias:
      FAST_TACTICS.defenseWeight * (2 * benefit - pressure) +
      FAST_TACTICS.barrelContactWeight * contact +
      COMBAT.policy.drillKnightDefense * drillKnight +
      (prematureSkeletons ? COMBAT.policy.preEmergenceSkeletons : 0) +
      (unansweredDrill ? COMBAT.policy.unansweredDrill : 0),
    intercept: Math.max(0, ...threats.map((t) => intercept(t.body))),
    usefulRoll,
    graveResponse: grave.response,
  };
}
