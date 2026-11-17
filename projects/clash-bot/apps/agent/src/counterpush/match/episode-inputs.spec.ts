import { describe, expect, it } from 'vitest';

import { episodeHarness, START } from './episode.fixture.ts';

const { play } = episodeHarness();

describe('card and ability inputs', () => {
  it('does not send a decision whose hand changed before the input', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: {
        start: { hand: START, elixir: 7 },
        swapped: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 7 },
      },
      decisions: [{ pick: 'knight', show: 'swapped' }],
    });
    expect(fake.match.plays).toEqual([]);
    expect(types).toEqual(['match_start', 'prediction', 'rejected', 'prediction', 'wait_check', 'result']);
    expect(events[2]).toMatchObject({ reason: 'stale_or_changed_screen', frame: 1 });
    expect(outcome).toMatchObject({ actions: 0, confirmed: 0, learningEligible: true });
  });

  it('stops sending inputs after three unconfirmed card inputs', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: { start: { hand: START, elixir: 7 } },
      decisions: [{ pick: 'knight' }, { pick: 'knight' }, { pick: 'knight' }],
      end: { inputs: 3, captures: 6 },
    });
    expect(fake.match.plays).toHaveLength(3);
    const checks = events.filter((event) => event.type === 'input_check');
    expect(checks).toHaveLength(3);
    expect(checks.every((event) => event.confirmed === false && event.checks === 4)).toBe(true);
    expect(types.filter((type) => type === 'input_recovery')).toHaveLength(1);
    expect(events.find((event) => event.type === 'input_recovery')).toMatchObject({
      reason: 'three_unconfirmed_card_inputs',
      learningEligible: false,
    });
    expect(types.at(-1)).toBe('result');
    expect(outcome).toMatchObject({ actions: 3, confirmed: 0, learningEligible: false });
  });

  it('uses the hero ability only after a confirmed Ice Wizard deployment', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: {
        start: { hand: ['ice_wizard', 'furnace', 'poison', 'skeletons'], elixir: 7 },
        deployed: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4, ability: true },
        used: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 2 },
      },
      decisions: [{ pick: 'ice_wizard' }, { pick: 'ability' }],
      afterPlay: { 1: 'deployed' },
      afterAbility: 'used',
      end: { inputs: 2, captures: 1 },
    });
    expect(fake.match.abilities).toBe(1);
    expect(fake.match.requests[0]!.candidates.some((action) => action.kind === 'ability')).toBe(false);
    expect(types).toEqual([
      'match_start',
      'prediction',
      'input_sent',
      'input_check',
      'prediction',
      'ability_sent',
      'ability_check',
      'result',
    ]);
    expect(events.find((event) => event.type === 'ability_check')).toMatchObject({
      confirmed: true,
      changed: true,
      handUnchanged: true,
      spent: 2,
      expectedCost: 2,
    });
    expect(outcome).toMatchObject({ actions: 2, confirmed: 2, abilityActions: 1, abilityConfirmed: 1 });
  });
});
