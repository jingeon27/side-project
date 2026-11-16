import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { crop, fingerprint, matchCard, type Template } from '../../android/perception/vision.ts';
import { loadProfile } from '../../shared/config.ts';

it('recognizes disabled hand artwork without claiming it is affordable or matching a blank animation', async () => {
  const profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
  const root = fileURLToPath(new URL('../../../assets/counterpush/hand-templates', import.meta.url));
  const groups = await Promise.all(
    profile.deck.map(async (card) => {
      const directory = join(root, 'variants', card),
        variants = await readdir(directory).catch(() => []);
      return Promise.all(
        [
          join(root, card + '.png'),
          ...variants.filter((p) => p.endsWith('.png')).map((p) => join(directory, p)),
        ].map(async (path) => ({ card, fingerprint: await fingerprint(await readFile(path)) })),
      );
    }),
  );
  const templates: Template[] = groups.flat();
  const image = await readFile(
    new URL('../../../test-fixtures/counterpush/disabled-hand.png', import.meta.url),
  );
  const cards = await Promise.all(
    profile.hand.map(
      async (rect) =>
        matchCard(await fingerprint(await crop(image, { ...rect, y: rect.y - 536 })), templates, 29, 3).card,
    ),
  );
  expect(cards).toEqual(['goblin_hut', 'graveyard', 'furnace', 'poison']);
  expect(matchCard(Array(144).fill(150), templates, 29, 3).card).toBeNull();
});
