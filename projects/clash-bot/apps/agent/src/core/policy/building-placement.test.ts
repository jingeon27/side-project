import { expect, it } from 'vitest';

import { BattleMemory, type BattleSituation } from '../battle/battle-state.ts';
import { COUNTERPUSH_DECK } from '../deck.ts';
import { screenPoint } from '../geometry.ts';
import { DEFAULT_PROFILE } from '../profile.ts';
import { affordableCandidates } from './candidates.ts';
import { predictivePlacements } from './predictive-placement.ts';

const scene = () =>
  new BattleMemory([...COUNTERPUSH_DECK]).observe({
    at: 10000,
    amount: 10,
    hand: ['goblin_hut', 'poison', 'barbarian_barrel', 'graveyard'],
    allies: [],
    enemies: [],
    inputPending: false,
  });
const profile = DEFAULT_PROFILE;

it('does not append troop lane support to the opening Hut pool', () => {
  const actions = affordableCandidates(profile, ['goblin_hut', null, null, null], 4, [], scene());
  const hut = actions.filter((action) => action.card === 'goblin_hut');
  expect(hut).toHaveLength(5);
  expect(hut.every((action) => action.description.includes('dedicated pull'))).toBe(true);
  expect(hut.some((action) => action.target.x === 95 && action.target.y === profile.riverY + 85)).toBe(false);
});
it('changes Hut pull placements when the enemy approaches the opposite lane', () => {
  const positions = (x: number) => {
    const state = scene();
    const field: BattleSituation = {
      ...state,
      opponent: {
        ...state.opponent,
        units: [{ kind: 'knight', card: 'knight', x, y: profile.riverY + 75, confidence: 0.98 }],
      },
    };
    return predictivePlacements(profile, 'goblin_hut', field.opponent.units, field);
  };
  expect(positions(95)).not.toEqual(positions(273));
  expect(positions(95)[0]?.target.x).toBeLessThanOrEqual(184);
  expect(positions(273)[0]?.target.x).toBeGreaterThanOrEqual(184);
});
it('avoids reusing an existing Hut area and visible enemy Poison', () => {
  const state = scene();
  const point = screenPoint(profile, [9, 11]);
  const field: BattleSituation = {
    ...state,
    own: { ...state.own, units: [{ card: 'goblin_hut', kind: 'goblin_hut', ...point, confidence: 0.98 }] },
    effects: [
      {
        card: 'poison',
        side: 'red',
        ...point,
        radius: 55,
        confidence: 0.98,
        visibleAgeMs: 1000,
        onsetCertain: true,
        source: 'visual',
      },
    ],
  };
  const first = predictivePlacements(profile, 'goblin_hut', [], field)[0];
  expect(first).toBeDefined();
  expect(Math.hypot((first?.target.x ?? 0) - point.x, (first?.target.y ?? 0) - point.y)).toBeGreaterThan(55);
});
it('aims Poison at the observed spawner instead of the unrelated tower fallback', () => {
  const state = scene();
  const target = screenPoint(profile, [8.6, 23.2]);
  const field: BattleSituation = {
    ...state,
    opponent: {
      ...state.opponent,
      units: [
        {
          card: 'goblin_hut',
          kind: 'goblin_hut',
          ...target,
          confidence: 0.98,
          velocity: { xPerSecond: 0, yPerSecond: 0, speedPixelsPerSecond: 0 },
          motion: { samples: 2, elapsedMs: 500 },
        },
      ],
    },
  };
  const first = predictivePlacements(profile, 'poison', [], field)[0];
  expect(Math.hypot((first?.target.x ?? 0) - target.x, (first?.target.y ?? 0) - target.y)).toBeLessThan(20);
});
it('does not generate the lateral melee defense offset for a rolling Barrel', () => {
  const state = scene();
  const enemy = { card: null, kind: 'barbarian' as const, x: 87, y: profile.riverY + 32, confidence: 0.98 };
  const field: BattleSituation = { ...state, opponent: { ...state.opponent, units: [enemy] } };
  const positions = predictivePlacements(profile, 'barbarian_barrel', [enemy], field);
  expect(positions.some((option) => option.description.includes('intercept'))).toBe(true);
  expect(positions.every((option) => !option.description.includes('lateral'))).toBe(true);
});

it('offers a central Firecracker lure only when the approaching body is identified', () => {
  const state = scene();
  const enemy = { card: null, kind: 'firecracker' as const, x: 95, y: profile.riverY - 15, confidence: 0.98 };
  const field: BattleSituation = { ...state, opponent: { ...state.opponent, units: [enemy] } };
  expect(predictivePlacements(profile, 'knight', [], field)[0]?.description).toContain('Firecracker lure');
  expect(
    predictivePlacements(profile, 'knight', [], state).some((row) =>
      row.description.includes('Firecracker lure'),
    ),
  ).toBe(false);
});

it('does not retain generic tower-center Graveyard candidates when effect-center calibration exists', () => {
  const calibrated = {
    ...profile,
    observedGraveyardCenters: {
      source: 'winning_opponent_effect_centers' as const,
      samples: 61,
      corpusSHA256: 'a'.repeat(64),
      left: [
        [-1.6, 0.1],
        [-1.6, 1],
      ] as [number, number][],
      right: [
        [1.5, 0.1],
        [1.5, 0.8],
      ] as [number, number][],
    },
  };
  const placements = predictivePlacements(calibrated, 'graveyard', [], scene());
  expect(placements).toHaveLength(4);
  expect(placements.every((row) => row.target.x < 85 || row.target.x > 283)).toBe(true);
});
