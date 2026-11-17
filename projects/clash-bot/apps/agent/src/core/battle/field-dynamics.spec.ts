import { describe, expect, it } from 'vitest';

import { COUNTERPUSH_DECK } from '../deck.ts';
import { BattleMemory } from './battle-state.ts';
import { FieldDynamics } from './field-dynamics.ts';
import type { UnitScan } from './observation.ts';

const scan = (x: number): UnitScan => ({
  markers: [],
  entities: [],
  elapsed_ms: 100,
  allies: [
    {
      card: 'furnace',
      kind: 'furnace',
      variant: 'base',
      confidence: 0.99,
      x: 120,
      y: 340,
      side: 'blue',
      label: 'furnace',
    },
  ],
  spawnedUnits: [{ kind: 'fire_spirit', sourceCard: 'furnace', side: 'blue', x, y: 315, confidence: 0.99 }],
});

describe('field dynamics', () => {
  it('links a visible child to a possible spawner, tracks motion, and does not charge another card', () => {
    const dynamics = new FieldDynamics('episode');
    const first = dynamics.observe(scan(125), 1000);
    expect(first.spawners[0]?.observedChildren).toBe(1);
    expect(first.allies.find((unit) => unit.kind === 'fire_spirit')).toMatchObject({
      card: null,
      sourceCard: 'furnace',
      possibleParent: first.spawners[0]?.trackId,
    });
    const second = dynamics.observe(scan(140), 1500);
    expect(second.spawners[0]?.observedChildren).toBe(1);
    expect(
      second.allies.find((unit) => unit.kind === 'fire_spirit')?.velocity?.speedPixelsPerSecond,
    ).toBeGreaterThan(0);
    const state = new BattleMemory([...COUNTERPUSH_DECK]).observe({
      at: 1500,
      amount: 5,
      hand: ['knight', 'furnace', 'ice_wizard', 'skeletons'],
      allies: second.allies,
      enemies: second.enemies,
      effects: second.effects,
      spawners: second.spawners,
      inputPending: false,
    });
    expect(state.elixirAccounting.ownSpent).toBe(0);
    expect(state.opponent.seenSpent).toBe(0);
  });
  it('keeps an existing effect active without pretending its initial cast time was observed', () => {
    const dynamics = new FieldDynamics('bootstrap');
    const field = dynamics.observe(
      {
        ...scan(125),
        effects: [{ card: 'graveyard', side: 'red', x: 95, y: 406, radius: 65, confidence: 0.98 }],
      },
      1000,
    );
    expect(field.effects[0]).toMatchObject({ card: 'graveyard', onsetCertain: false, predictions: [] });
  });
});
