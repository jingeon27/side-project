import { describe, expect, it } from 'vitest';

import { BattleMemory } from '../battle/battle-state.ts';
import type { CardId } from '../cards.ts';
import { tilePoint } from '../geometry.ts';
import { DEFAULT_PROFILE } from '../profile.ts';
import { actionCandidates } from './actions.ts';
import { affordableCandidates, bodyCard } from './candidates.ts';

const cards: CardId[] = ['graveyard', 'poison', 'goblin_hut', 'furnace'];
const situation = () =>
  new BattleMemory([...cards, 'knight', 'ice_wizard', 'skeletons', 'barbarian_barrel']).observe({
    at: 1000,
    amount: 10,
    hand: cards,
    allies: [],
    enemies: [],
    inputPending: false,
  });

describe('candidate controller repairs', () => {
  it('uses the King rear for a calm Trophy opening and does not defend distant enemies at the bridge', () => {
    const profile = { ...DEFAULT_PROFILE, riverY: 276 };
    const state = situation();
    const distant = [{ card: null, x: 273, y: 100, confidence: 0.98 }];
    state.opponent.units = distant;
    const hand: CardId[] = ['knight', 'furnace', 'skeletons', 'ice_wizard'];
    const choices = affordableCandidates(profile, hand, 10, distant, state);
    for (const card of hand) {
      const placements = choices.filter((row) => row.card === card);
      expect(placements.length).toBeGreaterThan(0);
      expect(placements.every((row) => tilePoint(profile, row.target)[1] <= 3.1)).toBe(true);
      expect(placements.some((row) => tilePoint(profile, row.target)[1] < 1)).toBe(true);
    }
    const invading = { ...distant[0], card: null, x: 95, y: profile.riverY + 75, confidence: 0.98 };
    state.opponent.units = [invading];
    expect(
      affordableCandidates(profile, ['knight', null, null, null], 10, [invading], state).some((row) =>
        row.description.includes('defend nearest'),
      ),
    ).toBe(true);
  });
  it('offers every affordable hand card despite missing tanks and unknown enemy resources, preserving baseline behavior', () => {
    const before = situation();
    const baseline = actionCandidates(DEFAULT_PROFILE, cards, 10, [], before);
    expect(baseline.some((a) => a.card === 'graveyard')).toBe(false);
    const actions = affordableCandidates(DEFAULT_PROFILE, cards, 10, [], before);
    expect(new Set(actions.map((a) => a.card))).toEqual(new Set([null, ...cards]));
    expect(actions.length).toBeLessThanOrEqual(26);
    expect(new Set(actions.map((a) => a.id)).size).toBe(actions.length);
    expect(
      actions.filter((a) => a.card === 'graveyard').every((a) => a.target.y < DEFAULT_PROFILE.riverY),
    ).toBe(true);
    expect(
      actions
        .filter((a) => a.card === 'furnace' || a.card === 'goblin_hut')
        .every((a) => a.target.y > DEFAULT_PROFILE.riverY),
    ).toBe(true);
    expect(affordableCandidates(DEFAULT_PROFILE, cards, 3, [], before).map((a) => a.card)).toEqual([null]);
    expect(actionCandidates(DEFAULT_PROFILE, cards, 10, [], before)).toEqual(baseline);
  });
  it('recognizes a tracked body without fabricating a new card spend and keeps child identities', () => {
    const before = situation();
    before.own.units.push({
      card: null,
      kind: 'knight',
      x: 95,
      y: DEFAULT_PROFILE.riverY + 14,
      confidence: 0.98,
    });
    const actions = affordableCandidates(DEFAULT_PROFILE, cards, 10, [], before);
    expect(actions.some((a) => a.card === 'furnace' && a.description.includes('behind advancing'))).toBe(
      true,
    );
    expect(before.own.units[0]!.card).toBeNull();
    expect(bodyCard({ card: 'graveyard', kind: 'skeleton', x: 90, y: 400, confidence: 0.95 })).toBe(
      'skeleton',
    );
  });
});
