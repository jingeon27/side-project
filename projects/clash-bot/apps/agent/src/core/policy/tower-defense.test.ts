import { expect, it } from 'vitest';

import { BattleMemory, type BattleSituation, type FieldUnit } from '../battle/battle-state.ts';
import { COUNTERPUSH_DECK } from '../deck.ts';
import { screenPoint } from '../geometry.ts';
import { DEFAULT_PROFILE } from '../profile.ts';
import type { QwenAction } from './actions.ts';
import { towerDefense } from './tower-defense.ts';

const profile = { ...DEFAULT_PROFILE, riverY: 276, tileScale: { x: 18, y: 130 / 9.5 } };
const body = (kind: FieldUnit['kind'], x: number, y: number): FieldUnit => ({
  kind,
  card: null,
  ...screenPoint(profile, [x, y]),
  confidence: 0.95,
});
const state = (enemies: FieldUnit[], allies: FieldUnit[] = []): BattleSituation =>
  new BattleMemory([...COUNTERPUSH_DECK]).observe({
    at: 10000,
    amount: 6,
    hand: ['knight', 'poison', 'graveyard', 'ice_wizard'],
    allies,
    enemies,
    inputPending: false,
  });
const actions: QwenAction[] = [
  { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' },
  { id: 1, slot: 1, card: 'knight', target: screenPoint(profile, [3.5, 8]), description: 'left defense' },
  { id: 2, slot: 1, card: 'knight', target: screenPoint(profile, [14.5, 8]), description: 'right defense' },
  { id: 3, slot: 3, card: 'graveyard', target: screenPoint(profile, [15.5, 25.5]), description: 'attack' },
  { id: 4, slot: 4, card: 'ice_wizard', target: screenPoint(profile, [9, 0.5]), description: 'rear build' },
];
const score = (result: ReturnType<typeof towerDefense>, id: number) =>
  result.actions.find((row) => row.id === id)?.bias ?? -Infinity;

it('responds to the threatened tower instead of waiting, attacking or building behind the king', () => {
  const result = towerDefense({ profile, situation: state([body('goblin', 3.5, 8)]), actions });
  expect(result.urgent).toBe(true);
  expect(score(result, 1)).toBeGreaterThan(score(result, 0) + 5);
  expect(score(result, 1)).toBeGreaterThan(score(result, 2) + 5);
  expect(score(result, 1)).toBeGreaterThan(score(result, 3) + 5);
  expect(score(result, 1)).toBeGreaterThan(score(result, 4) + 5);
  expect(result.towerHpKnown).toBe(0);
});

it('does not reward extra deployments onto a threat already covered by two observed defenders', () => {
  const result = towerDefense({
    profile,
    situation: state([body('goblin', 3.5, 8)], [body('knight', 3.5, 8), body('ice_wizard', 4, 9)]),
    actions,
  });
  expect(result.urgent).toBe(false);
  expect(score(result, 0)).toBeGreaterThan(score(result, 1));
});

it('uses measured movement and prioritizes the weaker observed tower in an otherwise equal two-lane attack', () => {
  const enemies = [body('goblin', 3.5, 9), body('goblin', 14.5, 9)];
  const result = towerDefense({
    profile,
    situation: state(enemies),
    actions,
    ownTowerHp: [
      { tower: 'left', hp: 800, confirmedAt: 10000, observedDamage: 0 },
      { tower: 'right', hp: 4800, confirmedAt: 10000, observedDamage: 0 },
    ],
  });
  expect(score(result, 1)).toBeGreaterThan(score(result, 2));
  const moving = {
    ...body('goblin', 3.5, 11),
    motion: { samples: 3, elapsedMs: 1000 },
    velocity: { xPerSecond: 0, yPerSecond: 27.37, speedPixelsPerSecond: 27.37 },
  };
  const staticRisk = towerDefense({ profile, situation: state([body('goblin', 3.5, 11)]), actions });
  const movingRisk = towerDefense({ profile, situation: state([moving]), actions });
  expect(movingRisk.pressure).toBeGreaterThan(staticRisk.pressure);
});

it('does not treat a ground-only defender as a reliable response to an unidentified body', () => {
  const unknown = body(undefined, 3.5, 8);
  const choices = [
    ...actions,
    {
      id: 5,
      slot: 4,
      card: 'ice_wizard' as const,
      target: screenPoint(profile, [3.5, 10]),
      description: 'near support',
    },
  ];
  const result = towerDefense({ profile, situation: state([unknown]), actions: choices });
  expect(score(result, 5)).toBeGreaterThan(score(result, 1));
});

it('preserves quiet-field behavior and does not invent zero HP for missing text', () => {
  const result = towerDefense({
    profile,
    situation: state([]),
    actions,
    ownTowerHp: [{ tower: 'left', hp: null, confirmedAt: 9000, observedDamage: 0 }],
  });
  expect(result.urgent).toBe(false);
  expect(result.actions.every((row) => row.bias === 0)).toBe(true);
  expect(result.towerHpKnown).toBe(0);
});

it('does not assign one Knight to every member of an incoming swarm', () => {
  const enemies = [body('goblin', 3.5, 8), body('goblin', 4, 8), body('goblin', 3, 8)];
  const result = towerDefense({ profile, situation: state(enemies, [body('knight', 3.5, 8)]), actions });
  expect(result.threats.filter((row) => row.covered > 0)).toHaveLength(1);
  expect(result.urgent).toBe(true);
});
