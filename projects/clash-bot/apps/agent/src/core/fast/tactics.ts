import { readFileSync } from 'node:fs';

import { match } from 'ts-pattern';
import { z } from 'zod';

import { bodyVector, CARD_CATALOGUE, catalogueCard } from '../card-catalogue.ts';
import { COMBAT } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import type { CombatBody } from '../placement/combat-projection.ts';
import { decisionProjection, type DecisionAction, type DecisionContext } from '../policy/decision-v3.ts';

// Declared mechanics offsets, shared with native search/deployment/training.
// They preserve every legal action and do not represent learned strength.
export const FAST_TACTICS = z
  .strictObject({
    format: z.literal('clash-fast-tactics-v1'),
    reserveElixir: z.number().nonnegative(),
    responseSeconds: z.number().positive(),
    engagementRadius: z.number().positive(),
    threatBoundary: z.number().positive(),
    defenseWeight: z.number().positive(),
    barbarianInterceptWeight: z.number().positive(),
    graveyardCounters: z.record(z.string(), z.number().positive()),
    supportCards: z.array(z.string()),
  })
  .parse(JSON.parse(readFileSync(new URL('../../../contracts/fast-tactics.json', import.meta.url), 'utf8')));

const distance = (x: number, y: number, body: Pick<CombatBody, 'x' | 'y'>) =>
  Math.hypot(x - body.x, y - body.y);
const future = (body: CombatBody) => ({
  x: body.x + (body.velocity?.[0] ?? 0) * FAST_TACTICS.responseSeconds,
  y: body.y + (body.velocity?.[1] ?? 0) * FAST_TACTICS.responseSeconds,
});
function canRespond(card: string | null, body: CombatBody) {
  const features = catalogueCard(card)?.features;
  if (!features) return false;
  if (features[CARD_CATALOGUE.cardFeatures.indexOf('spell')] === 1) return true;
  const flying = bodyVector(body.kind)[CARD_CATALOGUE.bodyFeatures.indexOf('flying')] === 1;
  return (features[CARD_CATALOGUE.cardFeatures.indexOf(flying ? 'airTargets' : 'groundTargets')] ?? 0) > 0;
}
const active = (context: DecisionContext, side: string, card: string, seconds: number) =>
  (context.effects ?? []).filter(
    (row) => row[0] === side && row[1] === card && (row[4] === null || row[4] < seconds),
  );

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
  const card = action[2];
  const x = action[4];
  const y = action[5];
  const poisons = active(context, 'blue', 'poison', 6);
  const graves = active(context, 'red', 'graveyard', 9).filter(
    (row) => row[3] < 16 && !poisons.some((p) => Math.hypot(p[2] - row[2], p[3] - row[3]) < 3),
  );
  const threats = context.bodies.enemy.filter(
    (body) =>
      body.kind !== 'barrel' &&
      body.kind !== 'goblin_hut' &&
      future(body).y < FAST_TACTICS.threatBoundary &&
      !context.bodies.own.some((own) => distance(own.x, own.y, body) < FAST_TACTICS.engagementRadius),
  );
  const responds = (body: Pick<CombatBody, 'x' | 'y'>) =>
    Math.max(0, 1 - distance(x, y, body) / (card === 'ice_wizard' ? 5 : FAST_TACTICS.engagementRadius));
  const graveResponse = Math.max(0, ...graves.map((row) => responds({ x: row[2], y: row[3] })));
  const troopResponse = Math.max(
    0,
    ...threats.filter((body) => canRespond(card, body)).map((body) => responds(future(body))),
  );
  const rollResponse = projection.opportunity > 0 ? 1 : 0;
  // The Barbarian appears at the END of the roll. Never value an opposite-lane barrel
  // by distance to its start, or by the optimistic damage interval alone.
  const intercept =
    card === 'barbarian_barrel'
      ? Math.max(
          0,
          ...threats
            .filter((body) => COMBAT.bodies[body.kind]?.ground)
            .map((body) =>
              Math.max(
                0,
                1 -
                  distance(x, y + COMBAT.barbarian_barrel.length, future(body)) /
                    FAST_TACTICS.engagementRadius,
              ),
            ),
        )
      : 0;
  const response = match(card)
    .with('graveyard', () => 0)
    .with('barbarian_barrel', () => Math.max(rollResponse, intercept))
    .with('poison', () => Math.max(projection.opportunity > 0 ? troopResponse : 0, graveResponse))
    .otherwise(() => Math.max(troopResponse, graveResponse));
  const pressure = Math.max(
    graves.length ? 1 : 0,
    ...threats.map((body) => Math.min(1, Math.max(0, (FAST_TACTICS.threatBoundary - future(body).y) / 8))),
  );
  const defense = FAST_TACTICS.defenseWeight * pressure * (2 * response - 1);
  const barrel =
    card === 'barbarian_barrel'
      ? (projection.opportunity === 0 && intercept === 0
          ? projection.reserveBarrel
            ? COMBAT.policy.reservedRoll
            : COMBAT.policy.emptyRoll
          : 0) +
        FAST_TACTICS.barbarianInterceptWeight * intercept
      : 0;
  const poison =
    card === 'poison'
      ? (projection.trajectoryDamage === 0 && graveResponse === 0 ? COMBAT.policy.emptyPoison : 0) +
        (poisons.some((p) => Math.hypot(x - p[2], y - p[3]) < 3) ? COMBAT.policy.redundantPoison : 0)
      : 0;
  const supported = context.bodies.own.some(
    (body) => FAST_TACTICS.supportCards.includes(body.kind) && body.y >= 17 && Math.abs(x - body.x) < 4.5,
  );
  const counters = counterAvailability(context);
  const followup = context.hand.includes('poison') && context.elixir >= 9;
  const graveyard =
    card === 'graveyard'
      ? (!supported && !followup ? COMBAT.policy.unsupportedGraveyard * counters : 0) +
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
  return defense + barrel + poison + graveyard + king;
}

export const fastActionBias = (context: DecisionContext) =>
  context.actions.map((action) => actionBias(context, action));
