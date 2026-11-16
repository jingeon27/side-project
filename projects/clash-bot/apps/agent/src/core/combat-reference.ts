import { readFileSync } from 'node:fs';

import { z } from 'zod';

// Level 11 reference potential, not measured Counterpush damage or future hits.
export const PLACEMENT_EFFECTS = z
  .strictObject({
    format: z.literal('level11-placement-reference-v1'),
    ice_wizard: z.strictObject({ damage: z.number().positive(), radius: z.number().positive() }),
    barbarian_barrel: z.strictObject({
      damage: z.number().positive(),
      length: z.number().positive(),
      width: z.number().positive(),
    }),
    poison: z.strictObject({
      dps: z.number().positive(),
      duration: z.number().positive(),
      radius: z.number().positive(),
    }),
    knownGroundBodies: z.array(z.string()),
  })
  .parse(
    JSON.parse(readFileSync(new URL('../../contracts/placement-effects.json', import.meta.url), 'utf8')),
  );
