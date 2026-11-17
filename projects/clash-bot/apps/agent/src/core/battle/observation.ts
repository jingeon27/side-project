import { z } from 'zod';

import { cardIdSchema } from '../cards.ts';
import { UNIT_KINDS } from '../knowledge.ts';
import { battleSituationSchema, healthSchema } from './battle-state.ts';

// CPU 인식 워커가 화면 한 장에서 읽은 결과다. Python(clash_bot.perception.vision_worker)이 같은 형태로 응답한다.
export const unitScanSchema = z.object({
  graveyardPresence: z.tuple([z.number(), z.number()]).optional(),
  entities: z.array(
    z.object({
      card: cardIdSchema,
      label: z.string(),
      confidence: z.number().min(0).max(1),
      x: z.number(),
      y: z.number(),
      marker_y: z.number(),
      marker_x: z.number().optional(),
      kind: z.enum(UNIT_KINDS).nullable().optional(),
      variant: z.enum(['base', 'evolution', 'hero', 'unknown']).optional(),
      box: z.array(z.number()).length(4),
      health: healthSchema.optional(),
      side: z.literal('red'),
    }),
  ),
  markers: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      bottom: z.number(),
      width: z.number(),
      kind: z.enum(['unit', 'effect']).optional(),
    }),
  ),
  elapsed_ms: z.number(),
  allies: z
    .array(
      z.object({
        card: cardIdSchema,
        label: z.string(),
        confidence: z.number().min(0).max(1),
        kind: z.enum(UNIT_KINDS).nullable().optional(),
        variant: z.enum(['base', 'evolution', 'hero', 'unknown']).optional(),
        x: z.number(),
        y: z.number(),
        side: z.literal('blue'),
        health: healthSchema.optional(),
      }),
    )
    .default([]),
  spawnedUnits: z
    .array(
      z.object({
        kind: z.enum(['fire_spirit', 'spear_goblin']),
        sourceCard: z.enum(['furnace', 'goblin_hut']),
        confidence: z.number().min(0).max(1),
        x: z.number(),
        y: z.number(),
        side: z.enum(['red', 'blue']),
        marker_x: z.number().optional(),
        marker_y: z.number().optional(),
        health: healthSchema.optional(),
      }),
    )
    .optional(),
  effects: z
    .array(
      z.object({
        card: z.enum(['graveyard', 'poison']),
        side: z.enum(['red', 'blue']),
        x: z.number(),
        y: z.number(),
        radius: z.number().positive(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .optional(),
});
export type UnitScan = z.infer<typeof unitScanSchema>;
export type UnitDetection = UnitScan['entities'][number];

// 경기 중 자동 추적한 상대 행동 하나다. 행동 전 상황은 행동 이전 화면의 상태만 담는다.
const frameSchema = z.object({ image: z.string().min(1), capturedAt: z.number().positive() });
export const opponentObservationSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  before: frameSchema,
  after: frameSchema,
  card: cardIdSchema,
  lane: z.enum(['left', 'right', 'center']),
  evidence: z.enum(['new_unit_visible', 'spell_effect_visible']),
  confidence: z.number().min(0).max(1),
  verifiedActor: z.boolean(),
  absentBefore: z.boolean(),
  context: z.string().max(500),
  grounding: z.object({ x: z.number(), y: z.number(), box: z.array(z.number()).length(4) }).optional(),
  situation: battleSituationSchema,
});
export type OpponentObservation = z.infer<typeof opponentObservationSchema>;
