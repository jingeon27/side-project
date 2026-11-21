import { z } from 'zod';

import { cardIdSchema } from '../cards.ts';
import { UNIT_KINDS } from '../knowledge.ts';
import { healthSchema } from './battle-state.ts';

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
