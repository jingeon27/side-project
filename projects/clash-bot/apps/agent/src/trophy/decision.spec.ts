import { expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../config.ts';
import { trophyPrompt } from './decision.ts';

it('keeps unknown enemy identities/resources unknown while using the shared tile contract', () => {
  const prompt = trophyPrompt(
    DEFAULT_PROFILE,
    ['knight', null, 'graveyard', 'poison'],
    8,
    [
      {
        id: 9,
        slot: 1,
        card: 'knight',
        target: { x: 95, y: DEFAULT_PROFILE.riverY + 130 },
        description: 'defend',
      },
      { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' },
    ],
    [{ x: 273, y: DEFAULT_PROFILE.riverY }],
  );
  expect(prompt).toContain('enemyMana=0-10;hand=K?GP;next=;own=;enemy=?14.5,16;');
  expect(prompt).toContain('A:K3.5,6.5 B:W');
  expect(prompt).toContain('Equal mana,cap10,FIFO4');
});
