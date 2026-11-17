import { readFileSync } from 'node:fs';

import { z } from 'zod';

export const FAST_TACTICS = z
  .strictObject({
    format: z.literal('clash-fast-tactics-v2'),
    reserveElixir: z.number().nonnegative(),
    responseSeconds: z.number().positive(),
    engagementRadius: z.number().positive(),
    threatBoundary: z.number().positive(),
    defenseWeight: z.number().positive(),
    barbarianInterceptWeight: z.number().positive(),
    graveyardCounters: z.record(z.string(), z.number().positive()),
    supportCards: z.array(z.string()),
    drillPriority: z.number().positive(),
    drillBarbarianResponse: z.number().min(0).max(1),
    deploymentPriority: z.number().positive(),
    positions: z.strictObject({
      stagingY: z.number(),
      frontWeight: z.number(),
      laneWeight: z.number(),
      hutX: z.number(),
      hutY: z.number(),
      hutXWeight: z.number(),
      hutYWeight: z.number(),
      hutFrontY: z.number(),
      hutFrontWeight: z.number(),
      hutCoverageWeight: z.number(),
      hutPoisonWeight: z.number(),
    }),
  })
  .parse(JSON.parse(readFileSync(new URL('../../../contracts/fast-tactics.json', import.meta.url), 'utf8')));
