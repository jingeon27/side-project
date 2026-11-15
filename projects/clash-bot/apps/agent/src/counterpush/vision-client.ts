import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { cardIdSchema, type CardId } from '../config.ts';
import { QwenClient } from '../qwen-client.ts';

const scanSchema = z.object({
  entities: z.array(
    z.object({
      card: cardIdSchema,
      label: z.string(),
      confidence: z.number().min(0).max(1),
      x: z.number(),
      y: z.number(),
      marker_y: z.number(),
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
        x: z.number(),
        y: z.number(),
        side: z.literal('blue'),
      }),
    )
    .default([]),
});
export type UnitScan = z.infer<typeof scanSchema>;
export type UnitDetection = UnitScan['entities'][number];

export class CounterpushVisionClient extends QwenClient {
  constructor(dataDir: string) {
    super(
      join(dataDir, 'qwen/.venv/bin/python'),
      fileURLToPath(new URL('./vision_worker.py', import.meta.url)),
      join(dataDir, 'counterpush/detector'),
    );
  }
  async scan(image: string): Promise<UnitScan> {
    return scanSchema.parse(await this.request({ image }, 15_000));
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
