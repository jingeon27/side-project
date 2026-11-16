import { describe, expect, it } from 'vitest';

import { BattleMemory } from '../battle/battle-state.ts';
import type { CardId } from '../cards.ts';
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
