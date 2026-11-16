import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, loadProfile } from '../../shared/config.ts';
import { HAND_REFERENCE_DIRECTORY, loadHandReferences } from '../../shared/hand-references.ts';
import { fixture } from '../testing/fixture.ts';
import {
  analyze,
  fingerprint,
  loadCounterpushTemplates,
  loadTemplates,
  matchCard,
  normalize,
  type Templates,
} from './vision.ts';

describe('extracting battle state from screen pixels', () => {
  it('skips the generic field scan when a separate detector owns it, preserving hand and resource reads', async () => {
    const { image, templates } = await fixture({ elixir: 8, enemies: 3 });
    const complete = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    const ownOnly = await analyze(image, DEFAULT_PROFILE, templates, 1000, { fieldMarkers: false });
    expect(ownOnly.hand).toEqual(complete.hand);
    expect(ownOnly.elixir).toBe(complete.elixir);
    expect(ownOnly.enemies).toEqual([]);
    expect(complete.enemies).toHaveLength(3);
  });
  it('finds four unique hand cards, elixir and separate enemy health bars', async () => {
    const { image, templates } = await fixture({ elixir: 8, enemies: 3 });
    const observation = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    expect(observation.inBattle).toBe(true);
    expect(observation.hand.map((item) => item.card)).toEqual(DEFAULT_PROFILE.deck.slice(0, 4));
    expect(observation.elixir).toBe(8);
    expect(observation.enemies).toHaveLength(3);
    expect(observation.allies).toHaveLength(0);
  });

  it.each([0, 3, 10])('reads %i elixir without assuming maximum elixir when uncertain', async (elixir) => {
    const { image, templates } = await fixture({ elixir });
    expect((await analyze(image, DEFAULT_PROFILE, templates, 0)).elixir).toBe(elixir);
  });

  it('does not recognize a battle without its visual marker', async () => {
    const { image, templates } = await fixture({ marker: false });
    expect((await analyze(image, DEFAULT_PROFILE, templates, 0)).inBattle).toBe(false);
  });

  it('requires a clear winner between similar card templates', () => {
    const sample = [20, 80, 110, 40];
    const result = matchCard(
      sample,
      [
        { card: 'knight', fingerprint: sample },
        { card: 'archers', fingerprint: sample },
      ],
      29,
      3,
    );
    expect(result.card).toBeNull();
  });

  it('compares ambiguity between cards when two artwork variants match one card', () => {
    const sample = [20, 80, 110, 40];
    expect(
      matchCard(
        sample,
        [
          { card: 'knight', fingerprint: sample },
          { card: 'knight', fingerprint: [21, 79, 111, 39] },
          { card: 'archers', fingerprint: [90, 20, 40, 130] },
        ],
        29,
        3,
      ).card,
    ).toBe('knight');
  });

  it('rejects a tall phone viewport rather than stretching touch coordinates', async () => {
    const image = await sharp({ create: { width: 1080, height: 2340, channels: 3, background: '#111' } })
      .png()
      .toBuffer();
    await expect(normalize(image, DEFAULT_PROFILE)).rejects.toThrow('9:16');
  });

  it('maps a cropped and resized source viewport without moving the hand slots', async () => {
    const { image, templates } = await fixture();
    const source = await sharp({ create: { width: 800, height: 1400, channels: 3, background: '#111' } })
      .composite([{ input: await sharp(image).resize(720, 1280).png().toBuffer(), left: 40, top: 60 }])
      .png()
      .toBuffer();
    const profile = { ...DEFAULT_PROFILE, viewport: { x: 40, y: 60, width: 720, height: 1280 } };
    const observation = await analyze(source, profile, templates, 0);
    expect(observation.inBattle).toBe(true);
    expect(observation.hand[0]?.card).toBe('knight');
    expect(observation.viewport).toEqual(profile.viewport);
  });
});

describe('loading hand reference images', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });
  const counterpushProfile = () =>
    loadProfile(fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)));
  const gray = (level: string) =>
    sharp({ create: { width: 61, height: 73, channels: 3, background: level } })
      .png()
      .toBuffer();
  async function dataDirectory(files: Record<string, Buffer>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'clash-bot-templates-'));
    directories.push(directory);
    await Promise.all(
      Object.entries({ 'templates/battle.png': await gray('#606060'), ...files }).map(
        async ([path, bytes]) => {
          await mkdir(dirname(join(directory, path)), { recursive: true });
          await writeFile(join(directory, path), bytes);
        },
      ),
    );
    return directory;
  }
  const cardsMatching = async (templates: Templates, image: Buffer) => {
    const target = (await fingerprint(image)).join();
    return templates.cards
      .filter((template) => template.fingerprint.join() === target)
      .map((template) => template.card);
  };

  it('keeps the repository card for a device copy of a repository image stored under another card', async () => {
    const poison = await readFile(join(HAND_REFERENCE_DIRECTORY, 'variants/poison/disabled-2.png'));
    const directory = await dataDirectory({ 'templates/variants/goblin_hut/0070.png': poison });
    const templates = await loadTemplates(directory, await counterpushProfile());
    expect(await cardsMatching(templates, poison)).toEqual(['poison']);
    expect(templates.cards).toHaveLength((await loadHandReferences()).references.length);
  });

  it('adds images learned on the device and uses a downloaded default only until the device has its own', async () => {
    const learned = await gray('#303030');
    const downloadedKnight = await gray('#909090');
    const downloadedSkeletons = await gray('#d0d0d0');
    const directory = await dataDirectory({
      'templates/knight.png': learned,
      'assets/cards/knight.jpg': downloadedKnight,
      'assets/cards/skeletons.jpg': downloadedSkeletons,
    });
    const templates = await loadTemplates(directory, await counterpushProfile());
    expect(await cardsMatching(templates, learned)).toEqual(['knight']);
    expect(await cardsMatching(templates, downloadedKnight)).toEqual([]);
    expect(await cardsMatching(templates, downloadedSkeletons)).toEqual(['skeletons']);
  });

  it('names the deck cards that have no reference image', async () => {
    const directory = await dataDirectory({});
    await expect(loadTemplates(directory, DEFAULT_PROFILE)).rejects.toThrow(
      'archers, giant, musketeer, minipekka, fireball, arrows',
    );
  });

  it('reads Counterpush hand cards only from the repository images', async () => {
    const learned = await gray('#303030');
    const directory = await dataDirectory({
      'templates/knight.png': learned,
      'templates/variants/knight/learned.png': learned,
    });
    const templates = await loadCounterpushTemplates(directory, await counterpushProfile());
    expect(await cardsMatching(templates, learned)).toEqual([]);
    expect(templates.cards).toHaveLength((await loadHandReferences()).references.length);
  });
});
