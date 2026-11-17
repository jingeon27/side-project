import { COMBAT } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { decisionProjection, type DecisionAction, type DecisionContext } from '../policy/decision-v3.ts';
import { fastDefense } from './defense.ts';
import { positionBias } from './position-bias.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

// Declared mechanics offsets; search, live play and residual training use the same scores.
function counterAvailability(context: DecisionContext) {
  return Math.max(
    ...Object.entries(FAST_TACTICS.graveyardCounters).map(([card, cost]) => {
      if (context.enemyElixir.max < cost) return 0;
      const observed = context.enemyCycle?.find((row) => row[0] === card);
      if (!observed) return COMBAT.policy.unknownCounterWeight;
      if (observed[1] > 0) return 0;
      return observed[2] === 0 ? 1 : COMBAT.policy.uncertainCounterWeight;
    }),
  );
}

function actionBias(context: DecisionContext, action: DecisionAction) {
  if (action[1] === 'wait') return 0;
  const projection = decisionProjection(context, action);
  if (action[1] === 'ability')
    return projection.opportunity === 0 ? COMBAT.policy.noObservedSkillOpportunity : 0;
  const card = action[2],
    x = action[4],
    y = action[5];
  const defense = fastDefense(context, action, projection);
  const emptyRoll = projection.reserveBarrel ? COMBAT.policy.reservedRoll : COMBAT.policy.emptyRoll;
  const barrel =
    card === 'barbarian_barrel'
      ? (!defense.usefulRoll && defense.intercept === 0 ? emptyRoll : 0) +
        FAST_TACTICS.barbarianInterceptWeight * defense.intercept
      : 0;
  const poison =
    card === 'poison'
      ? (projection.trajectoryDamage === 0 && defense.graveResponse === 0 ? COMBAT.policy.emptyPoison : 0) +
        (context.effects?.some(
          (e) =>
            e[0] === 'blue' &&
            e[1] === 'poison' &&
            (e[4] === null || e[4] < 6) &&
            Math.hypot(x - e[2], y - e[3]) < 3,
        )
          ? COMBAT.policy.redundantPoison
          : 0)
      : 0;
  const supported = context.bodies.own.some(
    (body) => FAST_TACTICS.supportCards.includes(body.kind) && body.y >= 17 && Math.abs(x - body.x) < 4.5,
  );
  const followup = context.hand.includes('poison') && context.elixir >= 9;
  const graveyard =
    card === 'graveyard'
      ? (!supported && !followup ? COMBAT.policy.unsupportedGraveyard * counterAvailability(context) : 0) +
        (context.elixir - action[3] < FAST_TACTICS.reserveElixir && context.enemyElixir.max >= 3
          ? COMBAT.policy.defenseReserve
          : 0)
      : 0;
  const kingActive =
    context.towers && ((context.towers.enemy[0] ?? 1) < 1 || context.towers.enemy.slice(1).includes(0));
  const radius = card === 'poison' ? COMBAT.poison.radius : COMBAT.policy.graveyardSpawnRadius;
  const king =
    (card === 'graveyard' || card === 'poison') &&
    !kingActive &&
    Math.hypot(x - (18 - DEPLOYMENT.kingTowerTile[0]), y - (32 - DEPLOYMENT.kingTowerTile[1])) <=
      radius + COMBAT.policy.kingFootprintRadius
      ? COMBAT.policy.kingDamage
      : 0;
  return defense.bias + barrel + poison + graveyard + king + positionBias(context, action);
}
export const fastActionBias = (context: DecisionContext) =>
  context.actions.map((action) => actionBias(context, action));
