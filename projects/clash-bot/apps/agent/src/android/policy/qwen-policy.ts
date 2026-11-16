import { z } from 'zod';

import { blockedDeployment } from '../../game/placement.ts';
import {
  CARD_INFO,
  cardIdSchema,
  HEIGHT,
  WIDTH,
  type CardId,
  type Point,
  type Profile,
} from '../../shared/config.ts';
import { difference } from '../perception/vision.ts';

const normalizeCard = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.keys(CARD_INFO).find((id) => id.replaceAll('_', '') === normalized) ?? null;
};
export const qwenPrediction = z.object({
  phase: z.enum(['battle', 'lobby', 'result', 'unknown']),
  hand: z.array(z.preprocess(normalizeCard, cardIdSchema.nullable())).length(4),
  elixir: z.int().min(0).max(10),
  slot: z.int().min(0).max(4),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  outcome: z.enum(['win', 'loss', 'draw', 'unknown']).default('unknown'),
});
export type QwenPrediction = z.infer<typeof qwenPrediction>;

export function qwenOutputSchema(
  profile: Profile,
  battle: boolean,
  elixir = 0,
  cards?: Array<CardId | null>,
) {
  const affordable = cards?.flatMap((card, index) =>
    card && CARD_INFO[card].cost <= elixir ? [index + 1] : [],
  );
  const slots = affordable?.length
    ? elixir >= 8
      ? affordable
      : [0, ...affordable]
    : cards
      ? [0]
      : elixir >= 8
        ? [1, 2, 3, 4]
        : [0, 1, 2, 3, 4];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['phase', 'hand', 'elixir', 'slot', 'x', 'y', 'outcome'],
    properties: {
      phase: battle ? { const: 'battle' } : { type: 'string', enum: ['lobby', 'result', 'unknown'] },
      hand: cards
        ? { const: cards }
        : {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: battle ? { enum: profile.deck } : { const: null },
          },
      elixir: { const: battle ? elixir : 0 },
      slot: battle ? { type: 'integer', enum: slots } : { const: 0 },
      x: { type: 'number', minimum: 0, maximum: 1 },
      y: { type: 'number', minimum: 0, maximum: 1 },
      outcome: battle ? { const: 'unknown' } : { type: 'string', enum: ['win', 'loss', 'draw', 'unknown'] },
    },
  };
}
export type FreshBattle = {
  battle: boolean;
  elixir: number;
  hand: number[][];
  capturedAt: number;
};

export function parsePrediction(text: string): QwenPrediction {
  const object = text.match(/\{[\s\S]*\}/)?.[0];
  if (!object) throw new Error('Qwen이 JSON 판단을 반환하지 않았습니다.');
  return qwenPrediction.parse(JSON.parse(object));
}

export function validateQwenAction(
  prediction: QwenPrediction,
  before: FreshBattle,
  latest: FreshBattle,
  profile: Profile,
  now: number,
): { slot: number; target: Point; card: string } | null {
  if (
    prediction.phase !== 'battle' ||
    prediction.slot === 0 ||
    !before.battle ||
    !latest.battle ||
    now - before.capturedAt > 8000 ||
    now - latest.capturedAt > 1500
  )
    return null;
  const slot = prediction.slot - 1;
  const card = prediction.hand[slot];
  if (
    !card ||
    !profile.deck.includes(card) ||
    latest.elixir < CARD_INFO[card].cost ||
    prediction.elixir < CARD_INFO[card].cost ||
    difference(before.hand[slot] ?? [], latest.hand[slot] ?? []) > 12
  )
    return null;
  const target = { x: Math.round(prediction.x * WIDTH), y: Math.round(prediction.y * HEIGHT) };
  const arena = profile.arena;
  if (
    target.x < arena.x ||
    target.x >= arena.x + arena.width ||
    target.y < arena.y ||
    target.y >= arena.y + arena.height ||
    blockedDeployment(profile, card, target) ||
    (CARD_INFO[card].role !== 'spell' && target.y <= profile.riverY + 8)
  )
    return null;
  return { slot, card, target };
}
