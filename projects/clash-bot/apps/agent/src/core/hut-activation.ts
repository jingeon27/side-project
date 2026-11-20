import { readFileSync } from 'node:fs';

import { z } from 'zod';

const geometry = z
  .strictObject({
    tableVersion: z.string(),
    nominalRangeTiles: z.number().positive(),
    sourceRadiusTiles: z.number().positive(),
    buildingExtraTiles: z.number().nonnegative(),
    centerReachByBody: z.record(z.string(), z.number().positive()),
  })
  .parse(JSON.parse(readFileSync(new URL('../../contracts/hut-activation.json', import.meta.url), 'utf8')));

const reachByBody = new Map(Object.entries(geometry.centerReachByBody));
export const HUT_NOMINAL_RANGE = geometry.nominalRangeTiles;

export function wakesHut(kind: string, dx: number, dy: number) {
  const reach = reachByBody.get(kind);
  return reach !== undefined && Math.hypot(dx, dy) <= reach;
}
