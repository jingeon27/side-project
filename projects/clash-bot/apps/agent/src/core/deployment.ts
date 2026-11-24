import { readFileSync } from 'node:fs';

import { z } from 'zod';

const tile = z.tuple([z.number().min(0).max(18), z.number().min(0).max(16)]);

export type FallenPrincessTowers = { own: number[]; enemy: number[] };
export function pocketTiles(fallen: readonly number[]): Array<readonly [number, number]> {
  return [
    ...(fallen.includes(0)
      ? ([
          [7.5, 18.5],
          [7.5, 19.5],
        ] as const)
      : []),
    ...(fallen.includes(1)
      ? ([
          [10.5, 18.5],
          [10.5, 19.5],
        ] as const)
      : []),
  ];
}

// Native battle and visible-screen policies use the same King Tower rear cells.
export const DEPLOYMENT = z
  .strictObject({
    format: z.literal('clash-deployment-v1'),
    kingTowerTile: tile,
    kingBackTiles: z.array(tile).length(2),
  })
  .parse(JSON.parse(readFileSync(new URL('../../contracts/deployment.json', import.meta.url), 'utf8')));
