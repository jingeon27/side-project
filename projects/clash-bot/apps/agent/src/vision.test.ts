import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from './config.ts';
import { healthMarkers } from './vision.ts';

it('distinguishes actual enemy health bars from arena decorations and tower artwork', async () => {
  const { data, info } = await sharp(await readFile(new URL('./testing/arena-health.png', import.meta.url)))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const markers = healthMarkers(
    { data, width: info.width, height: info.height, channels: info.channels },
    { ...DEFAULT_PROFILE, riverY: 276 },
    'enemy',
  );
  expect(markers).toEqual([
    { x: 92.5, y: 277, width: 9 },
    { x: 48, y: 380, width: 26 },
  ]);
});
