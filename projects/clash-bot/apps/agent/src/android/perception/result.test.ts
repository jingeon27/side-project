import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { readBattleResult } from './result.ts';

// Actual settled 0–1 result crops; player names and clan information are removed.
const fixture = () => readFile(new URL('../../../test-fixtures/android/result-loss.png', import.meta.url));

describe('battle result verification', () => {
  it('records the observed loss even when the model previously called it a win', async () => {
    expect(await readBattleResult(await fixture())).toEqual({ outcome: 'loss', blue: 0, red: 1 });
  });

  it('waits for the settled result controls before assigning a reward', async () => {
    const mask = await sharp({ create: { width: 80, height: 35, channels: 3, background: '#121b32' } })
      .png()
      .toBuffer();
    const pending = await sharp(await fixture())
      .composite([{ input: mask, left: 200, top: 575 }])
      .png()
      .toBuffer();
    expect(await readBattleResult(pending)).toBeNull();
  });
});
