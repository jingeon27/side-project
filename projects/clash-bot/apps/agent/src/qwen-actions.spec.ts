import { describe, expect, it } from 'vitest';

import { CARD_INFO, DEFAULT_PROFILE } from './config.ts';
import { actionCandidates } from './qwen-actions.ts';

describe('legal actions proposed to Qwen', () => {
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
    expect(actions[0]?.target).toEqual({ x: 260, y: 428 });
    expect(actions.some((a) => a.id === 0)).toBe(false);
  });
  it('treats furnace as a ranged support troop and preserves mini pekka as another card', () => {
    const actions = actionCandidates(DEFAULT_PROFILE, ['furnace', 'minipekka', null, null], 4, [
      { x: 95, y: 360 },
    ]);
    expect(CARD_INFO.furnace).toMatchObject({ cost: 4, role: 'support' });
    expect(actions.find((action) => action.card === 'furnace')?.target).toEqual({ x: 95, y: 405 });
    expect(actions.find((action) => action.card === 'minipekka')?.target).toEqual({ x: 95, y: 378 });
  });
});
