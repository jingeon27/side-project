import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { atomicWrite } from '../../shared/assets.ts';

const castSchema = z.object({
  id: z.string(),
  side: z.enum(['blue', 'red']),
  observedMs: z.number().nonnegative(),
  samples: z
    .array(
      z.object({
        afterMs: z.number().nonnegative().max(12_000),
        dx: z.number().min(-2).max(2),
        dy: z.number().min(-2).max(2),
        confidence: z.number().min(0.85).max(1),
      }),
    )
    .max(100),
});
export type SpawnCast = z.infer<typeof castSchema>;

// Learns repeated FIRST-VISIBILITY observations, not privileged spawn times.
// Different casts are independent evidence; frames from one cast do not count
// as multiple confirmations. Raw observations stay in the episode states log.
export class SpawnPatterns {
  readonly casts: SpawnCast[];
  readonly path: string | undefined;
  constructor(casts: SpawnCast[] = [], path?: string) {
    this.casts = casts;
    this.path = path;
  }
  static async open(path: string) {
    const raw = await readFile(path, 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    const parsed = raw
      ? z.object({ version: z.literal(1), casts: z.array(castSchema).max(200) }).parse(JSON.parse(raw)).casts
      : [];
    return new SpawnPatterns(parsed, path);
  }
  add(cast: SpawnCast) {
    if (
      cast.observedMs < 6000 ||
      cast.observedMs > 12_000 ||
      cast.samples.length < 3 ||
      this.casts.some((item) => item.id === cast.id)
    )
      return;
    this.casts.push(castSchema.parse(cast));
    this.casts.splice(0, Math.max(0, this.casts.length - 200));
  }
  predict(effect: { side: 'red' | 'blue'; x: number; y: number; radius: number; visibleAgeMs: number }) {
    const groups = new Map<string, Array<{ cast: string; afterMs: number; dx: number; dy: number }>>();
    for (const cast of this.casts.filter((item) => item.side === effect.side)) {
      for (const sample of cast.samples) {
        const key = [
          Math.round(sample.afterMs / 500),
          Math.round(sample.dx * 4),
          Math.round(sample.dy * 4),
        ].join(':');
        groups.set(key, [...(groups.get(key) ?? []), { ...sample, cast: cast.id }]);
      }
    }
    return [...groups.values()]
      .flatMap((samples) => {
        const support = new Set(samples.map((sample) => sample.cast)).size;
        if (support < 3) return [];
        const mean = (key: 'afterMs' | 'dx' | 'dy') =>
          samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
        const inMs = mean('afterMs') - effect.visibleAgeMs;
        return inMs > 0 && inMs < 2500
          ? [
              {
                x: effect.x + mean('dx') * effect.radius,
                y: effect.y + mean('dy') * effect.radius,
                inMs: Math.round(inMs),
                supportingCasts: support,
                uncertaintyPx: Math.round(effect.radius / 4),
                source: 'empirical_first_visibility' as const,
              },
            ]
          : [];
      })
      .toSorted((first, second) => first.inMs - second.inMs)
      .slice(0, 8);
  }
  async save() {
    if (this.path)
      await atomicWrite(
        this.path,
        JSON.stringify(
          { version: 1, observation: 'first_visibility_not_exact_spawn', casts: this.casts },
          null,
          2,
        ) + '\n',
      );
  }
}
