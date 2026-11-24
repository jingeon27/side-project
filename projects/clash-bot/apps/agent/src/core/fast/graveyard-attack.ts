import { bodyVector, CARD_CATALOGUE, catalogueCard } from '../card-catalogue.ts';
import { COMBAT } from '../combat-reference.ts';
import { DEPLOYMENT, pocketTiles } from '../deployment.ts';
import type { EffectForecast } from '../placement/combat-projection.ts';
import type { DecisionAction, DecisionContext } from '../policy/decision-v3.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

const attack = FAST_TACTICS.graveyardAttack;
const building = CARD_CATALOGUE.bodyFeatures.indexOf('building');

export function graveyardPlan(context: DecisionContext) {
  const own = context.bodies.own;
  const enemy = context.bodies.enemy;
  const cycle = context.enemyCycle ?? [];
  const seen = new Set([...enemy.map((body) => body.kind), ...cycle.map(([card]) => card)]);
  const standing = enemy.filter((body) => body.y < 17);
  const safe =
    !context.deployments.length &&
    !context.effects?.some(([side, card, , y]) => side === 'red' && card === 'graveyard' && y < 16) &&
    !standing.some(
      (body) =>
        body.kind === 'goblin_drill' ||
        (bodyVector(body.kind)[building] !== 1 &&
          (!FAST_TACTICS.fragileBodies.includes(body.kind) || body.y <= 10)),
    ) &&
    standing.filter((body) => FAST_TACTICS.fragileBodies.includes(body.kind)).length < 2;
  const fallen = {
    own: context.fallenTowers?.own ?? [0, 1].filter((i) => context.towers?.own[i + 1] === 0),
    enemy: context.fallenTowers?.enemy ?? [0, 1].filter((i) => context.towers?.enemy[i + 1] === 0),
  };
  const double = (context.clock ?? 0) >= attack.doubleElixirAt;
  const twoCrown = fallen.own.length === 1 && fallen.enemy.length === 1;
  const witchAbsent = (cycle.find(([card]) => card === 'witch_mother')?.[1] ?? 0) > 0;
  const witchHold =
    enemy.some((body) => body.kind === 'witch_mother') || (seen.has('witch_mother') && !witchAbsent);
  const drillControl =
    seen.has('goblin_drill') &&
    ![...seen].some(
      (card) =>
        card !== 'goblin_drill' &&
        (attack.heavyThreats.includes(card) || attack.primaryAttacks.includes(card)),
    ) &&
    attack.drillAnswers.some((card) => context.hand.includes(card));
  const primary = [...seen].filter((card) => attack.primaryAttacks.includes(card));
  const cyclePlays =
    safe &&
    new Set(cycle.map(([card]) => card)).size >= attack.cycleMinimumKnown &&
    primary.length === 1 &&
    !attack.heavyThreats.includes(primary[0] ?? '')
      ? (cycle.find(([card]) => card === primary[0])?.[1] ?? 0)
      : 0;
  const tanks = own.filter(
    (body) => FAST_TACTICS.supportCards.includes(body.kind) && body.y >= attack.tankMinY,
  );
  const poisonReady = context.hand.includes('poison');
  const comboCost = (catalogueCard('graveyard')?.elixir ?? 5) + (catalogueCard('poison')?.elixir ?? 4);
  const funding =
    safe &&
    !witchHold &&
    (drillControl || tanks.length > 0 || double) &&
    poisonReady &&
    context.hand.includes('graveyard') &&
    context.elixir >= attack.fundFromElixir &&
    context.elixir < comboCost;
  return {
    safe,
    drillControl,
    poisonReady,
    comboCost,
    funding,
    tanks,
    cyclePlays,
    fallen,
    double,
    twoCrown,
    witchHold,
    witchAbsent,
  };
}

export function pocketKnight(
  context: DecisionContext,
  action: DecisionAction,
  plan: ReturnType<typeof graveyardPlan>,
) {
  if (action[2] !== 'knight' || !plan.safe || !plan.twoCrown || plan.witchHold) return 0;
  const [x, y] = action.slice(4) as [number, number];
  if (!pocketTiles(plan.fallen.enemy).some(([px, py]) => Math.hypot(px - x, py - y) <= 0.8)) return 0;
  const followup = (context.effects ?? []).some(
    ([side, card, gx, gy, age]) =>
      side === 'blue' &&
      card === 'graveyard' &&
      gy >= 23 &&
      Math.abs(gx - 9) <= 3 &&
      age !== null &&
      age <= 5,
  );
  const funded =
    context.hand.includes('graveyard') &&
    context.elixir >= action[3] + 5 &&
    !plan.tanks.some((body) => Math.hypot(body.x - x, body.y - y) < 4);
  return followup || funded ? attack.pocketKnightBonus : 0;
}

export function graveyardAttack(
  context: DecisionContext,
  action: DecisionAction,
  projection: EffectForecast,
  plan: ReturnType<typeof graveyardPlan>,
) {
  const card = action[2];
  if (card !== 'graveyard' && card !== 'poison')
    return {
      bonus: 0,
      combo: false,
      support: false,
      followup: false,
      flexibleReserve: false,
      crownTarget: false,
    };
  const x = action[4];
  const y = action[5];
  const princesses = [3.5, 14.5].filter((_, i) => !plan.fallen.enemy.includes(i));
  const kingDistance = Math.hypot(
    x - (18 - DEPLOYMENT.kingTowerTile[0]),
    y - (32 - DEPLOYMENT.kingTowerTile[1]),
  );
  const central = plan.twoCrown && Math.abs(x - 9) <= 3 && y >= 23;
  const crownDistance = Math.min(
    ...princesses.map((lane) => Math.hypot(x - lane, y - 25.5)),
    princesses.length === 0 || central ? kingDistance : Infinity,
  );
  const tank = plan.tanks.some((unit) => Math.abs(unit.x - x) < 4.5 && (central || unit.x < 9 === x < 9));
  const ownPoison = context.effects?.some(
    ([side, spell, px, py, age]) =>
      side === 'blue' && spell === 'poison' && (age === null || age < 6) && Math.hypot(x - px, y - py) < 4,
  );
  const followup =
    card === 'poison' &&
    plan.safe &&
    !ownPoison &&
    crownDistance <= COMBAT.poison.radius &&
    !!context.effects?.some(
      ([side, spell, gx, gy, age]) =>
        side === 'blue' &&
        spell === 'graveyard' &&
        gy >= 22 &&
        age !== null &&
        age <= attack.poisonLastAge &&
        Math.hypot(x - gx, y - gy) <= 2.5 &&
        (projection.trajectoryDamage > 0 ||
          context.bodies.enemy.some((unit) => Math.hypot(unit.x - gx, unit.y - gy) <= 3.5)),
    );
  const crownTarget = crownDistance <= COMBAT.policy.graveyardSpawnRadius - 0.5;
  const opening = card === 'graveyard' && plan.safe && crownTarget && !plan.witchHold;
  const combo =
    opening && plan.poisonReady && context.elixir >= plan.comboCost && (tank || plan.drillControl);
  const support = opening && tank;
  const bonus =
    (combo ? attack.comboBonus : 0) +
    (support ? attack.supportedAttackBonus : 0) +
    (opening && plan.double && (tank || context.elixir >= 8) ? attack.doubleAttackBonus : 0) +
    (opening && central && tank ? attack.pocketKnightBonus : 0) +
    (opening && plan.witchAbsent ? attack.motherWitchWindowBonus : 0) +
    (opening && plan.cyclePlays >= attack.cycleMinimumPlays ? attack.cycleAttackBonus : 0) +
    (followup ? attack.poisonFollowupBonus : 0);
  return { bonus, combo, support, followup, flexibleReserve: followup && plan.drillControl, crownTarget };
}
