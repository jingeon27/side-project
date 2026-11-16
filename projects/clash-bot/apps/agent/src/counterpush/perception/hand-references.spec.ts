import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadProfile } from '../../shared/config.ts';
import { HAND_REFERENCE_DIRECTORY, loadHandReferences } from './hand-references.ts';

const copies: string[] = [];
afterEach(async () => {
  await Promise.all(copies.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copyReferences(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'clash-bot-hand-'));
  copies.push(directory);
  await cp(HAND_REFERENCE_DIRECTORY, directory, { recursive: true });
  return directory;
}

describe('repository hand references for Counterpush', () => {
  it('lists every image exactly once with its card, state and SHA-256', async () => {
    const manifest = await loadHandReferences();
    const images = (await readdir(HAND_REFERENCE_DIRECTORY, { recursive: true })).filter((path) =>
      path.endsWith('.png'),
    );
    expect(manifest.references.map((reference) => reference.path).toSorted()).toEqual(images.toSorted());
    expect(new Set(manifest.references.map((reference) => reference.sha256)).size).toBe(
      manifest.references.length,
    );
  });

  it('covers the normal and grayed-out look of every deck card except the recorded gaps', async () => {
    const profile = await loadProfile(
      fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
    );
    const manifest = await loadHandReferences();
    const gaps = profile.deck.flatMap((card) =>
      (['normal', 'disabled'] as const)
        .filter(
          (state) =>
            !manifest.references.some((reference) => reference.card === card && reference.state === state),
        )
        .map((state) => `${card}:${state}`),
    );
    expect(gaps.toSorted()).toEqual(manifest.missing.map((gap) => `${gap.card}:${gap.state}`).toSorted());
  });

  it('refuses an image whose bytes differ from the recorded SHA-256', async () => {
    const directory = await copyReferences();
    await writeFile(join(directory, 'knight.png'), await readFile(join(directory, 'poison.png')));
    await expect(loadHandReferences(directory)).rejects.toThrow('knight.png');
  });

  it('refuses a card label that differs from the folder the image is stored in', async () => {
    const directory = await copyReferences();
    const manifestPath = join(directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      references: Array<{ path: string; card: string }>;
    };
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        references: manifest.references.map((reference) =>
          reference.path === 'variants/poison/disabled-2.png'
            ? { ...reference, card: 'goblin_hut' }
            : reference,
        ),
      }),
    );
    await expect(loadHandReferences(directory)).rejects.toThrow('variants/<카드>/<상태>-<번호>.png');
  });
});
