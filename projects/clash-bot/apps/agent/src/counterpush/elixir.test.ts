import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../config.ts';
import { readElixir } from '../vision.ts';
import { counterpushElixir, plausibleSpend } from './elixir.ts';

it('reads actual Counterpush bars without mistaking the number bubble for an empty bar', async () => {
  const profile = { ...DEFAULT_PROFILE, elixir: { x: 117, y: 628, width: 236, height: 9 } };
  for (const expected of [7, 8, 9, 10]) {
    const bytes = await readFile(new URL(`./testing/elixir-${expected}.png`, import.meta.url));
    const { data, info } = await sharp(bytes)
      .extend({ top: 624, bottom: 0, left: 0, right: 0, background: '#000' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = { data, width: info.width, height: info.height, channels: info.channels };
    const read = readElixir(pixels, profile.elixir);
    const result = counterpushElixir({ elixir: read.value, elixirAmount: read.amount }, profile);
    expect(result.value).toBe(expected);
    expect(result.range.min).toBeLessThanOrEqual(expected + 0.2);
    expect(result.range.max).toBeGreaterThanOrEqual(expected - 0.2);
  }
});

it('rejects a fully dark spend animation instead of confirming an eight-elixir Skeletons play', () => {
  expect(plausibleSpend(8, 1, 600)).toBe(false);
  expect(plausibleSpend(1, 1, 600)).toBe(true);
  expect(plausibleSpend(0, 1, 1200)).toBe(true);
  expect(plausibleSpend(0, 4, 600)).toBe(false);
});
