import { catalogueCard } from '../card-catalogue.ts';
import { COMBAT } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { decisionProjection, type DecisionAction, type DecisionContext } from '../policy/decision-v3.ts';
import { fastDefense } from './defense.ts';
import { openingIceWizardHasValue, worthwhileBarrel } from './defensive-spending.ts';
import { graveyardAttack, graveyardPlan, pocketKnight } from './graveyard-attack.ts';
import { positionBias } from './position-bias.ts';
import { FAST_TACTICS } from './tactics-spec.ts';
import { hogThreat, royalGiantThreat, towersCovering } from './tower-pull.ts';

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

const isTroop = (card: string | null) =>
  ['troop', 'ranged_troop'].includes(catalogueCard(card)?.placement ?? '');

function placementAdvice(
  context: DecisionContext,
  action: DecisionAction,
  defense: ReturnType<typeof fastDefense>,
  projection: ReturnType<typeof decisionProjection>,
  crownTarget: boolean,
  plan: ReturnType<typeof graveyardPlan>,
) {
  const { placementAdvice: advice } = FAST_TACTICS;
  const [, , card, , x, y] = action;
  if (
    card === 'graveyard' &&
    !crownTarget &&
    defense.graveResponse === 0 &&
    context.bodies.enemy.filter(
      (body) => Math.hypot(body.x - x, body.y - y) <= COMBAT.policy.graveyardSpawnRadius,
    ).length < 2
  )
    return -advice.emptyGraveyard;
  if (card === 'graveyard' && crownTarget && !plan.twoCrown) {
    const lane = x < 9 ? 0 : 1;
    if (plan.fallen.enemy.includes(lane)) return 0;
    const outsideX = lane === 0 ? 2.5 : 15.5;
    return advice.graveyardOutsideCrown * Math.max(0, 1 - Math.hypot(x - outsideX, y - 25.5) / 1.5);
  }
  if (card === 'barbarian_barrel' && projection.trajectoryDamage === 0 && defense.intercept < 0.3)
    return -advice.emptyBarrel;
  if (card === 'knight' && defense.drillKnight > 0) return advice.drillKnight * defense.drillKnight;
  if (
    isTroop(card) &&
    defense.unansweredDrill &&
    context.bodies.enemy.some((body) => body.kind === 'goblin_drill' && body.y < 16)
  )
    return -advice.drillKnight;
  if (defense.siegePull > 0) return advice.timelyBuildingPull * defense.siegePull;
  if (card === 'goblin_hut' && defense.benefit === 0) {
    if (y < 6.5) return -advice.inactiveRearHut;
    if (plan.fallen.own.length < 2 && !towersCovering(context, x, y)) return -advice.uncoveredHut;
  }
  return 0;
}

const compress = (score: number) => FAST_TACTICS.priorLimit * Math.tanh(score / FAST_TACTICS.priorScoreScale);

function actionBias(
  context: DecisionContext,
  action: DecisionAction,
  plan: ReturnType<typeof graveyardPlan>,
) {
  if (action[1] === 'wait') return { score: 0, siegePull: 0 };
  const projection = decisionProjection(context, action);
  if (action[1] === 'ability')
    return {
      score: compress(projection.opportunity === 0 ? COMBAT.policy.noObservedSkillOpportunity : 0),
      siegePull: 0,
    };
  const card = action[2],
    x = action[4],
    y = action[5];
  const defense = fastDefense(context, action, projection);
  const urgent = defense.benefit >= FAST_TACTICS.urgentDefenseValue;
  const attack = graveyardAttack(context, action, projection, plan);
  const pocket = pocketKnight(context, action, plan);
  const riskyPlacement =
    (card === 'goblin_hut' &&
      !defense.siegePull &&
      context.bodies.enemy.some((body) => hogThreat(body) || royalGiantThreat(body))) ||
    (card === 'ice_wizard' && !openingIceWizardHasValue(context, action, projection)) ||
    (card === 'barbarian_barrel' && !worthwhileBarrel(context, action, projection, defense));
  const spendsComboElixir = plan.funding && card !== 'graveyard' && !urgent && !pocket;
  const emptyRoll = projection.reserveBarrel ? COMBAT.policy.reservedRoll : COMBAT.policy.emptyRoll;
  const barrel =
    card === 'barbarian_barrel'
      ? ((!defense.usefulRoll && defense.intercept < 0.35) ||
        (projection.reserveBarrel && defense.benefit < FAST_TACTICS.urgentDefenseValue)
          ? emptyRoll
          : 0) +
        FAST_TACTICS.barbarianInterceptWeight * defense.intercept
      : 0;
  const poison =
    card === 'poison'
      ? (projection.trajectoryDamage === 0 && defense.graveResponse === 0 && !attack.followup
          ? COMBAT.policy.emptyPoison
          : 0) +
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
  const afterSpend = context.elixir - action[3];
  const cycleWindow =
    card === 'graveyard' &&
    attack.crownTarget &&
    plan.cyclePlays >= FAST_TACTICS.graveyardAttack.cycleMinimumPlays &&
    (afterSpend >= 1 || plan.cyclePlays >= FAST_TACTICS.graveyardAttack.cycleEmptyReservePlays);
  const riskyFollowup =
    attack.flexibleReserve &&
    afterSpend < FAST_TACTICS.graveyardAttack.comboReserve &&
    !urgent &&
    context.enemyElixir.max > FAST_TACTICS.poorEnemyElixirMax &&
    plan.cyclePlays < FAST_TACTICS.graveyardAttack.cycleMinimumPlays;
  const graveyard =
    card === 'graveyard' && !supported && !followup
      ? attack.combo || attack.support
        ? 0
        : COMBAT.policy.unsupportedGraveyard * counterAvailability(context)
      : 0;
  const pressureWindow =
    cycleWindow ||
    (context.enemyElixir.max <= FAST_TACTICS.poorEnemyElixirMax &&
      ((card === 'graveyard' && y >= 22 && x >= 1 && x <= 17) ||
        (supported && y >= 12 && (card === 'knight' || card === 'ice_wizard'))));
  const riskyGraveyard =
    card === 'graveyard' &&
    ((y >= 16 && plan.witchHold) ||
      (!urgent && (!attack.crownTarget || (afterSpend < FAST_TACTICS.reserveElixir && !pressureWindow))));
  const overextendedGraveyard =
    card === 'graveyard' &&
    !urgent &&
    !pressureWindow &&
    !attack.support &&
    afterSpend < FAST_TACTICS.graveyardAttack.comboReserve;
  const unsupportedOpeningGraveyard =
    card === 'graveyard' &&
    attack.crownTarget &&
    !urgent &&
    !pressureWindow &&
    !attack.support &&
    !followup &&
    (context.clock ?? Infinity) < FAST_TACTICS.graveyardAttack.openingSeconds;
  const risk =
    riskyPlacement || spendsComboElixir || riskyFollowup || riskyGraveyard
      ? FAST_TACTICS.riskyPlayPenalty
      : 0;
  const reserve =
    urgent || pressureWindow
      ? 0
      : FAST_TACTICS.reservePerMissingElixir *
        Math.max(
          0,
          (attack.flexibleReserve ? FAST_TACTICS.graveyardAttack.comboReserve : FAST_TACTICS.reserveElixir) -
            (context.elixir - action[3]),
        );
  const kingActive =
    plan.fallen.enemy.length > 0 ||
    (context.towers && ((context.towers.enemy[0] ?? 1) < 1 || context.towers.enemy.slice(1).includes(0)));
  const radius = card === 'poison' ? COMBAT.poison.radius : COMBAT.policy.graveyardSpawnRadius;
  const king =
    (card === 'graveyard' || card === 'poison') &&
    !kingActive &&
    Math.hypot(x - (18 - DEPLOYMENT.kingTowerTile[0]), y - (32 - DEPLOYMENT.kingTowerTile[1])) <=
      radius + COMBAT.policy.kingFootprintRadius
      ? COMBAT.policy.kingDamage
      : 0;
  const score =
    compress(
      defense.bias +
        barrel +
        poison +
        graveyard +
        attack.bonus +
        pocket +
        king +
        positionBias(context, action) -
        reserve -
        risk,
    ) +
    placementAdvice(context, action, defense, projection, attack.crownTarget, plan) -
    (overextendedGraveyard ? FAST_TACTICS.unsupportedGraveyardSpendCost : 0) -
    (unsupportedOpeningGraveyard ? FAST_TACTICS.unsupportedOpeningGraveyardCost : 0);
  return { score, siegePull: defense.siegePull };
}
export function fastActionBias(context: DecisionContext) {
  const plan = graveyardPlan(context);
  const affordableTroop =
    context.elixir >= 10 &&
    context.actions.some(([, kind, card, cost]) => kind === 'card' && cost <= 4 && isTroop(card));
  // Keep placement evidence outside spending compression so identical resource costs
  // cannot erase the difference between hitting a target and rolling down an empty lane.
  const moves = context.actions.map((action) => actionBias(context, action, plan));
  const waitCost = Math.max(
    affordableTroop ? FAST_TACTICS.fullElixirWaitCost : 0,
    FAST_TACTICS.timelyBuildingWaitCost * Math.max(0, ...moves.map((move) => move.siegePull)),
  );
  return moves.map((move, index) => (context.actions[index]?.[1] === 'wait' ? -waitCost : move.score));
}
