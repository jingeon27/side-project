import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chunk, countBy } from 'es-toolkit';
import { match } from 'ts-pattern';
import { beforeAll, describe, expect, it } from 'vitest';

import { BattleMemory, type BattleSituation, type FieldUnit } from '../battle/battle-state.ts';
import type { CatalogueCard } from '../card-catalogue.ts';
import { LIVE_DECK, LIVE_DECK_EVOLUTIONS } from '../deck.ts';
import { screenPoint, tilePoint } from '../geometry.ts';
import { loadProfile, type Profile } from '../profile.ts';
import { fastCandidates, placementGrid, placementTiles } from './candidates.ts';

type Tile = [x: number, y: number];
// Python(clash_bot.arena.placement)이 쓴 사례다. arena/placement_test.py도 같은 파일을 검사한다.
const shared = JSON.parse(
  await readFile(new URL('../../../test-fixtures/fast-candidate-cases.json', import.meta.url), 'utf8'),
) as {
  ownGrid: number[];
  fieldGrid: number[];
  cases: Array<{
    placement: CatalogueCard['placement'];
    threat: Tile | null;
    targets: Tile[];
    rule: Tile[];
    grid: 'own' | 'field' | 'none';
  }>;
};

describe('placement tiles and grids are the ones the simulator trains on', () => {
  it.each(shared.cases.map((item, index) => [index, item.placement, item] as const))(
    'shared case %i (%s)',
    (_index, _placement, item) => {
      expect(placementTiles(item.placement, item.threat, item.targets)).toEqual(item.rule);
      expect(placementGrid(item.placement, item.targets)).toEqual(
        match(item.grid)
          .with('own', () => chunk(shared.ownGrid, 2))
          .with('field', () => [...item.targets, ...chunk(shared.fieldGrid, 2)])
          .with('none', () => [])
          .exhaustive(),
      );
    },
  );
});

const state = { profile: undefined as Profile | undefined };
beforeAll(async () => {
  state.profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
});

const situation = (enemies: FieldUnit[] = []): BattleSituation => {
  const observed = new BattleMemory([...LIVE_DECK], LIVE_DECK_EVOLUTIONS).observe({
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
  it('offers the opened central placements to both melee and ranged troops', () => {
    const profile = state.profile!;
    const actions = fastCandidates(profile, ['knight', 'ice_wizard', 'skeletons', null], 5, situation(), {
      own: [0],
      enemy: [1],
    });
    for (const card of ['knight', 'ice_wizard', 'skeletons']) {
      expect(tiles(profile, actions, card).slice(0, 2)).toEqual([
        [10.5, 18.5],
        [10.5, 19.5],
      ]);
    }
  });

  it('offers Poison at the observed friendly-side Graveyard before any skeleton is seen', () => {
    const profile = state.profile!;
    const point = [3.7, 7] as const;
    const observed = situation();
    const actions = fastCandidates(profile, ['poison', 'knight', 'furnace', 'graveyard'], 5, {
      ...observed,
      effects: [
        {
          ...screenPoint(profile, point),
          card: 'graveyard',
          side: 'red',
          radius: 52,
          confidence: 0.98,
          visibleAgeMs: 800,
          onsetCertain: true,
          source: 'visual',
        },
      ],
    });
    expect(tiles(profile, actions, 'poison')[0]).toEqual(point);
  });

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
    expect(tiles(profile, calm, 'knight').slice(0, 6)).toEqual([
      [3.5, 10],
      [14.5, 10],
      [3.5, 14],
      [14.5, 14],
      [8, 0.5],
      [10, 0.5],
    ]);
    // The placement-rule tiles lead; the grid follows: every own-side tile, every second field tile.
    expect(tiles(profile, calm, 'knight').length).toBeGreaterThan(200);
    expect(tiles(profile, calm, 'graveyard').slice(6, 8)).toEqual([
      [1, 1],
      [3, 1],
    ]);
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
    expect(tiles(profile, invaded, 'knight').slice(4, 6)).toEqual([
      [8, 0.5],
      [10, 0.5],
    ]);
    expect(tiles(profile, invaded, 'furnace')[0]).toEqual([14.5, 9]);
    expect(tiles(profile, invaded, 'poison')[0]).toEqual([14.5, 12]);
  });

  it("gives another deck's cards the simulator's tiles for their placement rule", () => {
    const profile = state.profile!;
    const calm = fastCandidates(
      profile,
      ['musketeer', 'fireball', 'goblin_barrel', 'goblin_drill'],
      10,
      situation(),
    );
    expect(tiles(profile, calm, 'musketeer').slice(0, 6)).toEqual([
      [3.5, 10],
      [14.5, 10],
      [3.5, 14],
      [14.5, 14],
      [8, 0.5],
      [10, 0.5],
    ]);
    expect(tiles(profile, calm, 'fireball').slice(0, 2)).toEqual([
      [3.5, 25.5],
      [14.5, 25.5],
    ]);
    expect(tiles(profile, calm, 'goblin_barrel').slice(0, 4)).toEqual([
      [3.5, 25.5],
      [14.5, 25.5],
      [3.5, 23.5],
      [14.5, 23.5],
    ]);
    expect(tiles(profile, calm, 'goblin_drill').slice(0, 4)).toEqual([
      [3.5, 22.5],
      [14.5, 22.5],
      [3.5, 28.5],
      [14.5, 28.5],
    ]);
    const invaded = fastCandidates(profile, ['musketeer'], 10, situation([enemy(profile, 14.5, 12)]));
    expect(tiles(profile, invaded, 'musketeer')[0]).toEqual([14.5, 9]);
  });

  it('skips unaffordable cards and keeps waiting available at high elixir like the simulator', () => {
    const profile = state.profile!;
    const poor = fastCandidates(profile, ['knight', 'furnace', 'graveyard', 'poison'], 3, situation());
    expect(Object.keys(countBy(poor, (action) => action.card ?? 'wait')).toSorted()).toEqual([
      'knight',
      'wait',
    ]);
    const full = fastCandidates(profile, ['knight', 'furnace', 'graveyard', 'poison'], 8, situation());
    expect(full.some((action) => action.id === 0)).toBe(true);
    expect(full.map((action) => action.id)).toEqual(full.map((_, index) => index));
    // No tile repeats for a card, and no own-side card lands past the river.
    const keys = full.map((action) => `${action.card}:${tilePoint(profile, action.target).join()}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      full
        .filter((action) => action.card === 'knight' || action.card === 'furnace')
        .every((action) => tilePoint(profile, action.target)[1] < 15),
    ).toBe(true);
  });
});
