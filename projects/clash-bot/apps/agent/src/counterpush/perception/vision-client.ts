import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { unitScanSchema, type UnitScan } from '../../core/battle/observation.ts';
import { type CardId } from '../../core/cards.ts';
import { JsonLineClient } from '../../shared/json-lines-client.ts';
import { pythonEnvironment, pythonExecutable } from '../../shared/python.ts';

export class CounterpushVisionClient extends JsonLineClient {
  readonly warmState = { done: false };
  constructor(dataDir: string) {
    super(
      pythonExecutable(dataDir),
      ['-m', 'clash_bot.perception.vision_worker'],
      join(dataDir, 'counterpush/detector'),
      ['3'],
      pythonEnvironment(dataDir),
    );
  }
  override async ready() {
    await super.ready();
    if (!this.warmState.done) {
      await this.scan(
        fileURLToPath(new URL('../../../test-fixtures/counterpush/unit-badges.png', import.meta.url)),
      );
      this.warmState.done = true;
    }
  }
  async scan(image: string): Promise<UnitScan> {
    return unitScanSchema.parse(await this.request({ image }, 15_000));
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
