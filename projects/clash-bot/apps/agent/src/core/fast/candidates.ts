import { clamp, minBy, range, uniqBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { BattleSituation } from '../battle/battle-state.ts';
import { catalogueCard, type CatalogueCard } from '../card-catalogue.ts';
import type { CardId } from '../cards.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { screenPoint, tilePoint } from '../geometry.ts';
import { blockedDeployment } from '../placement/placement.ts';
import type { QwenAction } from '../policy/actions.ts';
import type { Profile } from '../profile.ts';

type Tile = readonly [x: number, y: number];

const LANES: Tile[] = [[3.5, 10], [14.5, 10], [3.5, 14], [14.5, 14], ...DEPLOYMENT.kingBackTiles];
const ENEMY_TOWERS: Tile[] = [
  [3.5, 25.5],
  [14.5, 25.5],
];

// 시뮬레이터(clash_bot.arena.placement.placement_tiles)와 같은 배치 유형별 지점이다. 카드 이름이 아니라
// 카드 카탈로그의 배치 유형으로 정하므로 어느 덱의 카드든 같은 규칙을 쓴다. 각 카드는 앞의 6곳까지만 쓴다.
// 두 언어의 지점과 격자는 test-fixtures/fast-candidate-cases.json의 공유 사례로 맞춘다.
export const placementTiles = (
  placement: CatalogueCard['placement'],
  threat: Tile | null,
  enemies: Tile[],
): Tile[] =>
  match(placement)
    .with('spawn_spell', () =>
      [3.5, 14.5].flatMap((x): Tile[] => [
        [x, 25.5],
        [x + (x < 9 ? -0.8 : 0.8), 25],
        [x, 24.5],
      ]),
    )
    .with('area_spell', (): Tile[] => [...(threat ? [threat] : []), ...enemies.slice(0, 3), ...ENEMY_TOWERS])
    .with('building', (): Tile[] => [
      [9, 9],
      [7, 12],
      [11, 12],
      [3.5, 10],
      [14.5, 10],
      [9, 6],
    ])
    .with('troop', 'ranged_troop', 'rolling_spell', (rule): Tile[] => {
      if (!threat) return LANES;
      const gap = rule === 'ranged_troop' ? 3 : 1;
      return [
        [clamp(threat[0], 0.6, 17.4), clamp(threat[1] - gap, 1, 15)],
        [9, clamp(threat[1] - 1, 2, 13)],
        ...LANES.slice(2),
      ];
    })
    .with('tower_spell', (): Tile[] => [...ENEMY_TOWERS, [3.5, 23.5], [14.5, 23.5]])
    .with('anywhere', (): Tile[] => [
      ...(threat ? [threat] : []),
      [3.5, 22.5],
      [14.5, 22.5],
      [3.5, 28.5],
      [14.5, 28.5],
    ])
    .with('unsupported', (): Tile[] => [])
    .exhaustive()
    .slice(0, 6);

// 배치 유형 지점 뒤에 붙는 격자다. 유닛·건물은 우리 진영의 모든 칸, 주문은 상대 유닛 위치와 필드의 두 칸마다다.
// 정책이 모두 비교한다. 시뮬레이터(clash_bot.arena.placement.placement_grid)와 같은 순서다.
const OWN_GRID: Tile[] = range(15).flatMap((y) => range(18).map((x): Tile => [x + 0.5, y + 0.5]));
const FIELD_GRID: Tile[] = range(16).flatMap((y) => range(9).map((x): Tile => [2 * x + 1, 2 * y + 1]));
export const placementGrid = (placement: CatalogueCard['placement'], enemies: Tile[]): Tile[] =>
  match(placement)
    .with('troop', 'ranged_troop', 'building', 'rolling_spell', () => OWN_GRID)
    .with('area_spell', 'spawn_spell', 'tower_spell', 'anywhere', () => [...enemies, ...FIELD_GRID])
    .with('unsupported', (): Tile[] => [])
    .exhaustive();

// 빠른 정책(controller 4)의 후보다. 학습한 시뮬레이터와 같은 규칙으로 만들어 처음 보는 종류의 후보를 비교하지 않는다.
// 배치 유형 지점이 앞에 오고 격자가 뒤따른다. 화면에서 알 수 있는 금지 구역(타워·영웅 버튼·내 오두막)은 뺀다.
export function fastCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  situation: BattleSituation,
): QwenAction[] {
  const enemies = situation.opponent.units.map((unit): Tile => tilePoint(profile, unit));
  const graves = (situation.effects ?? [])
    .filter((effect) => effect.side === 'red' && effect.card === 'graveyard')
    .map((effect): Tile => tilePoint(profile, effect))
    .filter(([, y]) => y < 16);
  const threat =
    minBy(
      enemies.filter(([, y]) => y < 16),
      ([, y]) => y,
    ) ?? null;
  const plays = cards.flatMap((card, index) => {
    const entry = catalogueCard(card);
    if (card === null || !entry || entry.elixir > elixir) return [];
    const anchors = card === 'poison' ? graves : [];
    return uniqBy(
      [
        ...anchors,
        ...placementTiles(entry.placement, threat, enemies),
        ...placementGrid(entry.placement, enemies),
      ],
      ([x, y]) => `${x.toFixed(1)}:${y.toFixed(1)}`,
    )
      .map((tile) => ({ tile, target: screenPoint(profile, tile) }))
      .filter(({ target }) => !blockedDeployment(profile, card, target, situation))
      .map(({ tile, target }) => ({
        slot: index + 1,
        card,
        target,
        description: `${card} tile ${tile[0].toFixed(1)},${tile[1].toFixed(1)}`,
      }));
  });
  const ability = situation.own.ability;
  const abilities =
    ability?.availability === 'ready' && ability.cost <= elixir
      ? [
          {
            slot: 0,
            card: ability.card,
            kind: 'ability' as const,
            cost: ability.cost,
            abilityInstance: ability.instance,
            target: ability.target,
            description: 'hero ability',
          },
        ]
      : [];
  const moves = [...plays, ...abilities].map((move, index) => ({ id: index + 1, ...move }));
  // 잔량이 높아도 지출을 강제하지 않는다. 대기의 소실 비용도 정책이 비교한다.
  const wait = { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' };
  return [wait, ...moves];
}
