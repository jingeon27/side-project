import { fileURLToPath } from 'node:url';

import { countBy } from 'es-toolkit';
import { beforeAll, describe, expect, it } from 'vitest';

import { BattleMemory, type BattleSituation, type FieldUnit } from '../battle/battle-state.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../deck.ts';
import { screenPoint, tilePoint } from '../geometry.ts';
import { loadProfile, type Profile } from '../profile.ts';
import { fastCandidates } from './fast-candidates.ts';

const state = { profile: undefined as Profile | undefined };
beforeAll(async () => {
  state.profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
});

const situation = (enemies: FieldUnit[] = []): BattleSituation => {
  const observed = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS).observe({
    at: 1_000,
    amount: 5,
    hand: ['knight', 'furnace', 'graveyard', 'poison'],
    allies: [],
    enemies: [],
    inputPending: false,
  });
  return { ...observed, opponent: { ...observed.opponent, units: enemies } };
};
const enemy = (profile: Profile, x: number, y: number): FieldUnit => ({
  ...screenPoint(profile, [x, y]),
  card: 'knight',
  confidence: 0.95,
});
const tiles = (profile: Profile, actions: ReturnType<typeof fastCandidates>, card: string) =>
  actions.filter((action) => action.card === card).map((action) => tilePoint(profile, action.target));

describe('fast policy candidates follow the simulator legal-action rules', () => {
  it('round-trips tile and screen coordinates', () => {
    const profile = state.profile!;
    for (const tile of [
      [3.5, 25.5],
      [9, 9],
      [14.5, 14],
    ] as const)
      expect(tilePoint(profile, screenPoint(profile, tile))).toEqual([tile[0], tile[1]]);
  });

  it('offers lane defense without a threat and moves the first two troop spots in front of an invader', () => {
    const profile = state.profile!;
    const calm = fastCandidates(profile, ['knight', 'furnace', 'graveyard', 'poison'], 5, situation());
    expect(tiles(profile, calm, 'knight')).toEqual([
      [3.5, 10],
      [14.5, 10],
      [3.5, 14],
      [14.5, 14],
      [8, 0.5],
      [10, 0.5],
    ]);
    expect(tiles(profile, calm, 'graveyard')).toHaveLength(6);
    expect(calm[0]).toMatchObject({ id: 0, slot: 0, card: null });

    const invaded = fastCandidates(
      profile,
      ['knight', 'furnace', 'graveyard', 'poison'],
      5,
      situation([enemy(profile, 14.5, 12)]),
    );
    expect(tiles(profile, invaded, 'knight').slice(0, 2)).toEqual([
      [14.5, 11],
      [9, 11],
    ]);
    expect(tiles(profile, invaded, 'knight').slice(-2)).toEqual([
      [8, 0.5],
      [10, 0.5],
    ]);
    expect(tiles(profile, invaded, 'furnace')[0]).toEqual([14.5, 9]);
    expect(tiles(profile, invaded, 'poison')[0]).toEqual([14.5, 12]);
  });

  it('skips unaffordable cards and drops waiting from eight elixir like the simulator', () => {
    const profile = state.profile!;
    const poor = fastCandidates(profile, ['knight', 'furnace', 'graveyard', 'poison'], 3, situation());
    expect(countBy(poor, (action) => action.card ?? 'wait')).toEqual({ wait: 1, knight: 6 });
    const full = fastCandidates(profile, ['knight', 'furnace', 'graveyard', 'poison'], 8, situation());
    expect(full.some((action) => action.id === 0)).toBe(false);
    expect(full.map((action) => action.id)).toEqual(full.map((_, index) => index + 1));
  });
});
