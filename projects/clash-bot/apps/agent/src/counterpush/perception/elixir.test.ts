import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../../shared/config.ts';
import { counterpushBarReading, counterpushElixir, plausibleSpend } from './elixir.ts';

it('reads actual Counterpush bars without mistaking the number bubble for an empty bar', async () => {
  const profile = { ...DEFAULT_PROFILE, elixir: { x: 117, y: 628, width: 236, height: 9 } };
  for (const expected of [7, 8, 9, 10]) {
    const bytes = await readFile(
      new URL(`../../../test-fixtures/counterpush/elixir-${expected}.png`, import.meta.url),
    );
    const image = await sharp(bytes)
      .extend({ top: 624, bottom: 0, left: 0, right: 0, background: '#000' })
      .png()
      .toBuffer();
    const result = counterpushElixir(await counterpushBarReading(image, profile), profile);
    expect(result.value).toBe(expected);
    expect(result.range.min).toBeLessThanOrEqual(expected + 0.2);
    expect(result.range.max).toBeGreaterThanOrEqual(expected - 0.2);
  }
});

it('keeps a real full bar at ten while its white shine passes over the calibrated ROI', async () => {
  const profile = { ...DEFAULT_PROFILE, elixir: { x: 117, y: 628, width: 236, height: 9 } };
  for (const name of ['10-glow', '10-glow-wide']) {
    const image = await sharp(
      await readFile(new URL(`../../../test-fixtures/counterpush/elixir-${name}.png`, import.meta.url)),
    )
      .extend({ top: 624, bottom: 0, left: 0, right: 0, background: '#000' })
      .png()
      .toBuffer();
    const reading = await counterpushBarReading(image, profile);
    expect(counterpushElixir(reading, profile).value).toBe(10);
    expect(reading.elixirConfidence).toBeGreaterThanOrEqual(0.9);
  }
  const dark = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#101044' } })
    .png()
    .toBuffer();
  expect(counterpushElixir(await counterpushBarReading(dark, profile), profile).value).toBeLessThan(1);
});

it('rejects a fully dark spend animation instead of confirming an eight-elixir Skeletons play', () => {
  expect(plausibleSpend(8, 1, 600)).toBe(false);
  expect(plausibleSpend(1, 1, 600)).toBe(true);
  expect(plausibleSpend(0, 1, 1200)).toBe(true);
  expect(plausibleSpend(0, 4, 600)).toBe(false);
});
