import { describe, expect, it } from 'vitest';

import { episodeCoverage } from './audit.ts';

describe('opponent learning coverage', () => {
  it('keeps our inputs, opponent observations, selected cases and actual training distinct', () => {
    const events = [
      {
        type: 'input_check',
        action: { card: 'furnace' as const },
        changed: true,
        spent: 7,
        confirmed: false,
      },
      {
        type: 'input_check',
        action: { card: 'skeletons' as const },
        changed: true,
        spent: 0,
        confirmed: true,
      },
      {
        type: 'opponent_action',
        observation: { id: 'red-furnace', card: 'furnace' as const, situation: { at: 1000 } },
      },
      {
        type: 'opponent_action',
        observation: { id: 'red-poison', card: 'poison' as const, situation: { at: 2000 } },
      },
    ];
    const selected = [{ id: 'red-furnace', card: 'furnace' as const }];
    const result = episodeCoverage(events, selected, {
      updated: true,
      observations: [{ id: 'red-furnace' }],
    });
    expect(result.furnace).toEqual({
      ownConfirmed: 0,
      opponentRecognized: 1,
      withBeforeState: 1,
      selectedForTraining: 1,
      opponentTrained: 1,
    });
    expect(result.skeletons.ownConfirmed).toBe(1);
    expect(result.poison.opponentRecognized).toBe(1);
    expect(result.poison.opponentTrained).toBe(0);
    expect(result.knight.opponentTrained).toBe(0);
    expect(
      episodeCoverage(events, selected, { updated: false, observations: [{ id: 'red-furnace' }] }).furnace
        .opponentTrained,
    ).toBe(0);
  });
});
