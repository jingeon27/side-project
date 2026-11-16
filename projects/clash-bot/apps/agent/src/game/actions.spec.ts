import { describe, expect, it } from 'vitest';

import { BattleMemory } from '../counterpush/domain/battle-state.ts';
import { CARD_INFO, DEFAULT_PROFILE } from '../shared/config.ts';
import { actionCandidates } from './actions.ts';
import { blockedDeployment } from './placement.ts';

describe('legal actions proposed to Qwen', () => {
  it('sets up defense and a tank before unsupported graveyard/poison attacks, with three hut placements', () => {
    const cards = ['graveyard', 'poison', 'goblin_hut', 'furnace'] as const;
    const memory = new BattleMemory([
      'graveyard',
      'poison',
      'goblin_hut',
      'furnace',
      'knight',
      'ice_wizard',
      'skeletons',
      'barbarian_barrel',
    ]);
    const situation = memory.observe({
      at: 1000,
      amount: 10,
      hand: [...cards],
      allies: [],
      enemies: [],
      inputPending: false,
    });
    const actions = actionCandidates(DEFAULT_PROFILE, [...cards], 10, [], situation);
    expect(actions.some((action) => action.card === 'graveyard')).toBe(false);
    expect(actions.some((action) => action.card === 'poison')).toBe(false);
    expect(actions.filter((action) => action.card === 'goblin_hut')).toHaveLength(3);
    const supported = {
      ...situation,
      own: { ...situation.own, units: [{ card: 'knight' as const, confidence: 0.99, x: 95, y: 290 }] },
    };
    const counterattack = actionCandidates(DEFAULT_PROFILE, [...cards], 10, [], supported);
    const graveyards = counterattack.filter((action) => action.card === 'graveyard');
    expect(graveyards.every((action) => action.target.x < 184)).toBe(true);
    expect(new Set(graveyards.map((action) => `${action.target.x}:${action.target.y}`)).size).toBeGreaterThan(
      1,
    );
    expect(
      counterattack.some(
        (action) => action.card === 'furnace' && action.description.includes('behind advancing'),
      ),
    ).toBe(true);
    const graveyardActive = {
      ...supported,
      own: {
        ...supported.own,
        recentPlays: [{ card: 'graveyard' as const, at: 900, target: { x: 95, y: 125 } }],
      },
    };
    expect(
      actionCandidates(DEFAULT_PROFILE, [...cards], 10, [], graveyardActive)
        .filter((action) => action.card === 'poison')
        .map((action) => action.target.x),
    ).toEqual([95]);
    expect(
      actionCandidates(
        DEFAULT_PROFILE,
        ['poison', null, null, null],
        4,
        [
          { x: 30, y: 350 },
          { x: 180, y: 410 },
          { x: 330, y: 350 },
        ],
        situation,
      ).some((action) => action.card === 'poison'),
    ).toBe(false);
  });
  it('keeps graveyard on enemy towers and units on our own side', () => {
    const actions = actionCandidates(DEFAULT_PROFILE, ['graveyard', 'knight', null, null], 10, []);
    expect(
      actions.filter((a) => a.card === 'graveyard').every((a) => a.target.y < DEFAULT_PROFILE.riverY),
    ).toBe(true);
    expect(actions.filter((a) => a.card === 'knight').every((a) => a.target.y > DEFAULT_PROFILE.riverY)).toBe(
      true,
    );
    expect(actions.some((a) => a.id === 0)).toBe(false);
  });
  it('does not propose unaffordable or unidentified cards', () => {
    expect(
      actionCandidates(DEFAULT_PROFILE, ['graveyard', null, null, null], 2, []).map((a) => a.id),
    ).toEqual([0]);
  });
  it('prioritizes a nearby defensive placement and forces a response to a threat', () => {
    const threat = { x: 260, y: 410 };
    const actions = actionCandidates(DEFAULT_PROFILE, ['knight', null, null, null], 3, [threat]);
    expect(Math.hypot(actions[0]!.target.x - threat.x, actions[0]!.target.y - threat.y)).toBeLessThan(70);
    expect(blockedDeployment(DEFAULT_PROFILE, 'knight', actions[0]!.target)).toBe(false);
    expect(actions.some((a) => a.id === 0)).toBe(false);
  });
  it('treats furnace as a ranged support troop and preserves mini pekka as another card', () => {
    const actions = actionCandidates(DEFAULT_PROFILE, ['furnace', 'minipekka', null, null], 4, [
      { x: 95, y: 360 },
    ]);
    expect(CARD_INFO.furnace).toMatchObject({ cost: 4, role: 'support' });
    const furnace = actions.find((action) => action.card === 'furnace')!;
    const melee = actions.find((action) => action.card === 'minipekka')!;
    expect(furnace.target.y).toBeGreaterThan(melee.target.y);
    expect(blockedDeployment(DEFAULT_PROFILE, 'furnace', furnace.target)).toBe(false);
    expect(blockedDeployment(DEFAULT_PROFILE, 'minipekka', melee.target)).toBe(false);
  });
});
