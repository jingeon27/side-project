import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, loadProfile } from '../../core/profile.ts';
import { loadHandReferences } from './hand-references.ts';
import { loadHandCards, matchCard, readHand } from './hand.ts';

const counterpushProfile = () =>
  loadProfile(fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)));

describe('matching hand card fingerprints', () => {
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
});

describe('reading the hand from repository references', () => {
  it('loads every repository reference of the deck and names deck cards without one', async () => {
    expect(await loadHandCards(await counterpushProfile())).toHaveLength(
      (await loadHandReferences()).references.length,
    );
    await expect(loadHandCards(DEFAULT_PROFILE)).rejects.toThrow(
      'archers, giant, musketeer, minipekka, fireball, arrows',
    );
  });

  it('reads each slot and leaves a card seen in two slots or a blank slot unknown', async () => {
    const profile = await counterpushProfile();
    const references = (await loadHandReferences()).references.filter(
      (reference) => reference.state === 'normal',
    );
    const art = (card: string) => references.find((reference) => reference.card === card)!.bytes;
    const slot = async (index: number, card: string) => ({
      input: await sharp(art(card))
        .resize(profile.hand[index]!.width, profile.hand[index]!.height, { fit: 'fill' })
        .png()
        .toBuffer(),
      left: profile.hand[index]!.x,
      top: profile.hand[index]!.y,
    });
    const screen = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#20262c' } })
      .composite([await slot(0, 'knight'), await slot(1, 'knight'), await slot(2, 'poison')])
      .png()
      .toBuffer();
    expect(await readHand(screen, profile, await loadHandCards(profile))).toEqual([
      null,
      null,
      'poison',
      null,
    ]);
  });
});
