import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { cardIdSchema, type CardId } from '../../config.ts';
import { UNIT_KINDS } from '../../game-knowledge.ts';
import { QwenClient } from '../../qwen-client.ts';

const scanSchema = z.object({
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
export type UnitScan = z.infer<typeof scanSchema>;
export type UnitDetection = UnitScan['entities'][number];

export class CounterpushVisionClient extends QwenClient {
  readonly warmState = { done: false };
  constructor(dataDir: string) {
    super(
      join(dataDir, 'qwen/.venv/bin/python'),
      fileURLToPath(new URL('./vision_worker.py', import.meta.url)),
      join(dataDir, 'counterpush/detector'),
      ['3'],
    );
  }
  override async ready() {
    await super.ready();
    if (!this.warmState.done) {
      await this.scan(fileURLToPath(new URL('../testing/unit-badges.png', import.meta.url)));
      this.warmState.done = true;
    }
  }
  async scan(image: string): Promise<UnitScan> {
    return scanSchema.parse(await this.request({ image }, 15_000));
  }
  async guard(image: string) {
    return z
      .object({ graveyardPresence: z.tuple([z.number(), z.number()]), elapsed_ms: z.number() })
      .parse(await this.request({ op: 'guard', image }, 5000));
  }
  async absent(image: string, card: CardId, box: number[], gapMs: number) {
    return z
      .object({
        absent: z.boolean(),
        max_card_probability: z.number(),
        max_atlas_similarity: z.number(),
        max_effect_coverage: z.number().optional(),
      })
      .parse(await this.request({ op: 'absent', image, card, box, gap_ms: gapMs }, 15_000));
  }
}
