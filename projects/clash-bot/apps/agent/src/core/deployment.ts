import { readFileSync } from 'node:fs';

import { z } from 'zod';

const tile = z.tuple([z.number().min(0).max(18), z.number().min(0).max(16)]);

// Native battle and visible-screen policies use the same King Tower rear cells.
export const DEPLOYMENT = z
  .strictObject({
    format: z.literal('clash-deployment-v1'),
    kingTowerTile: tile,
    kingBackTiles: z.array(tile).length(2),
  })
  .parse(JSON.parse(readFileSync(new URL('../../contracts/deployment.json', import.meta.url), 'utf8')));
