import { match } from 'ts-pattern';

import { CARD_CATALOGUE, catalogueCard } from '../card-catalogue.ts';
import { COMBAT } from '../combat-reference.ts';
import type { DecisionAction, DecisionContext, DecisionEffect } from '../policy/decision-v3.ts';
import { FAST_TACTICS } from './tactics-spec.ts';

const remaining = (effect: DecisionEffect, duration: number) =>
  effect[4] === null ? duration / 2 : Math.max(0, duration - effect[4]);

const coverage = (x: number, y: number, effect: DecisionEffect, radius: number) =>
  Math.max(0, 1 - Math.hypot(x - effect[2], y - effect[3]) / radius);

const ground = CARD_CATALOGUE.cardFeatures.indexOf('groundTargets');
const troop = CARD_CATALOGUE.cardFeatures.indexOf('troop');
const splash = CARD_CATALOGUE.cardFeatures.indexOf('splash');

function counterStrength(card: string | null) {
  const declared = FAST_TACTICS.graveyardDefense[card ?? ''];
  if (declared !== undefined) return declared;
  const features = catalogueCard(card)?.features;
  if (!features?.[troop] || !features[ground]) return 0;
  return 0.45 + 0.65 * (features[splash] ?? 0);
}

export function graveyardDefense(context: DecisionContext, action: DecisionAction) {
  const effects = context.effects ?? [];
  if (!effects.length) return { pressure: 0, response: 0 };
  const strength = counterStrength(action[2]);
  const castDelay =
    COMBAT.inputDelaySeconds +
    (action[2] === 'poison' || action[2] === 'ice_wizard' ? COMBAT[action[2]].deploySeconds : 1);
  const ownPoison = effects.filter((effect) => effect[0] === 'blue' && effect[1] === 'poison');
  const enemyPoison = effects.filter((effect) => effect[0] === 'red' && effect[1] === 'poison');
  const radius = match(action[2])
    .with('poison', () => COMBAT.poison.radius + 0.5)
    .with('ice_wizard', () => 5)
    .otherwise(() => FAST_TACTICS.engagementRadius);
  const exposed =
    (action[2] === 'skeletons' || action[2] === 'ice_wizard') &&
    enemyPoison.some(
      (poison) =>
        remaining(poison, COMBAT.poison.duration) > castDelay &&
        Math.hypot(action[4] - poison[2], action[5] - poison[3]) <= COMBAT.poison.radius,
    );
  const exposureFactor = action[2] === 'skeletons' ? 0.1 : 0.5;
  const positionFactor = exposed ? exposureFactor : 1;
  const windows = effects.flatMap((grave) => {
    if (grave[0] !== 'red' || grave[1] !== 'graveyard' || grave[3] >= 16) return [];
    const time = remaining(grave, FAST_TACTICS.graveyardSeconds);
    if (!time) return [];
    const existing = Math.max(
      0,
      ...ownPoison.map(
        (poison) =>
          coverage(poison[2], poison[3], grave, COMBAT.poison.radius + 0.5) *
          Math.min(1, remaining(poison, COMBAT.poison.duration) / time),
      ),
    );
    const pressure = Math.min(1, time / 3) * (1 - existing);
    const response =
      pressure *
      strength *
      coverage(action[4], action[5], grave, radius) *
      positionFactor *
      Math.min(1, Math.max(0, time - castDelay) / 2);
    return [{ pressure, response }];
  });
  return {
    pressure: Math.max(0, ...windows.map((window) => window.pressure)),
    response: Math.max(0, ...windows.map((window) => window.response)),
  };
}
