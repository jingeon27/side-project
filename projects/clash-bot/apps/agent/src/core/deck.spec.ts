import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { CARD_CATALOGUE } from './card-catalogue.ts';
import { COUNTERPUSH_DECK } from './deck.ts';

const arena = JSON.parse(await readFile(new URL('../../contracts/arena.json', import.meta.url), 'utf8')) as {
  liveDeck: string;
  decks: Record<string, { cards: string[] }>;
};

it('plays the arena live deck, named through the card catalogue', () => {
  const byEngine = new Map(Object.entries(CARD_CATALOGUE.cards).map(([name, card]) => [card.engine, name]));
  expect(arena.decks[arena.liveDeck]!.cards.map((engine) => byEngine.get(engine))).toEqual([
    ...COUNTERPUSH_DECK,
  ]);
});
