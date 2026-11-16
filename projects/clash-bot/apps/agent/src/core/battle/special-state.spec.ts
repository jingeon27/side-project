import { describe, expect, it } from 'vitest';

import { EvolutionCycles } from './special-state.ts';

describe('evolution charges independent of FIFO', () => {
  it('charges only the deployed card, resets after the evolved use and does not affect another evolution', () => {
    const counter = new EvolutionCycles({ knight: 2, furnace: 2 });
    const first = counter.snapshot();
    counter.play('skeletons');
    expect(counter.snapshot()).toEqual(first);
    counter.play('knight');
    expect(counter.snapshot()[0]?.normalPlaysBeforeEvolved).toEqual({ min: 1, max: 1 });
    counter.play('knight');
    expect(counter.snapshot()[0]?.nextDeploy).toBe('evolution');
    counter.play('knight');
    expect(counter.snapshot()).toEqual(first);
    expect(first[0]?.normalPlaysBeforeEvolved).toEqual({ min: 2, max: 2 });
  });
  it('widens phases after missed plays and only an observed evolved deployment can reset them', () => {
    const counter = new EvolutionCycles({ knight: 2 });
    counter.uncertain();
    counter.play('knight');
    expect(counter.snapshot()[0]).toMatchObject({
      nextDeploy: 'unknown',
      counterExact: false,
      normalPlaysBeforeEvolved: { min: 0, max: 2 },
    });
    counter.play('knight', 'evolution');
    expect(counter.snapshot()[0]).toMatchObject({
      nextDeploy: 'base',
      counterExact: true,
      normalPlaysBeforeEvolved: { min: 2, max: 2 },
      engineCycleVerified: false,
    });
  });
});
