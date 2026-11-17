import { describe, expect, it } from 'vitest';

import type { CardId } from '../../core/cards.ts';
import { DEFAULT_PROFILE } from '../../core/profile.ts';
import { confirmPlacement, type FreshBattle } from './placement-check.ts';

const cards: Array<CardId | null> = ['knight', null, null, null];
const placement = { slot: 1, target: { x: 0.4 * 368, y: 0.55 * 652 } };
const frame: FreshBattle = { battle: true, elixir: 8, capturedAt: 1000, hand: [[10, 20, 30], [], [], []] };
const at = (x: number, y: number) => ({ ...placement, target: { x, y } });

describe('rechecking a chosen placement right before the input', () => {
  it('accepts an affordable own-side placement after rechecking the current hand', () => {
    expect(
      confirmPlacement(placement, cards, frame, { ...frame, capturedAt: 3000 }, DEFAULT_PROFILE, 3100),
    ).toEqual({ slot: 0, card: 'knight', target: { x: 147, y: 359 } });
  });
  it('rejects waiting, delayed answers, changed cards, unaffordable cards and a finished battle', () => {
    expect(
      confirmPlacement({ ...placement, slot: 0 }, cards, frame, frame, DEFAULT_PROFILE, 1100),
    ).toBeNull();
    expect(confirmPlacement(placement, cards, frame, frame, DEFAULT_PROFILE, 10000)).toBeNull();
    expect(
      confirmPlacement(
        placement,
        cards,
        frame,
        { ...frame, hand: [[200, 200, 200], [], [], []] },
        DEFAULT_PROFILE,
        1100,
      ),
    ).toBeNull();
    expect(
      confirmPlacement(placement, cards, frame, { ...frame, elixir: 2 }, DEFAULT_PROFILE, 1100),
    ).toBeNull();
    expect(
      confirmPlacement(placement, cards, frame, { ...frame, battle: false }, DEFAULT_PROFILE, 1100),
    ).toBeNull();
  });
  it('rejects opponent-side units, points outside the arena and blocked tiles', () => {
    expect(confirmPlacement(at(147, 0.2 * 652), cards, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(confirmPlacement(at(147, 0.95 * 652), cards, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(confirmPlacement(at(95, 406), cards, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(confirmPlacement(at(329, 480), cards, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
  });
});
