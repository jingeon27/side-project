import { clamp, minBy, uniqBy } from 'es-toolkit';
import { match } from 'ts-pattern';

import type { BattleSituation } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import { COUNTERPUSH_DECK } from '../deck.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { screenPoint, tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import type { QwenAction } from './actions.ts';
import { blockedDeployment } from './placement.ts';

type DeckCard = (typeof COUNTERPUSH_DECK)[number];
type Tile = readonly [x: number, y: number];

const deckCard = (card: CardId | null) => COUNTERPUSH_DECK.find((name) => name === card) ?? null;

const LANES: Tile[] = [[3.5, 10], [14.5, 10], [3.5, 14], [14.5, 14], ...DEPLOYMENT.kingBackTiles];

// 시뮬레이터(clash_bot.arena.engine.legal_actions)와 같은 카드별 배치 지점이다. 각 카드는 앞의 6곳까지만 쓴다.
const cardTiles = (card: DeckCard, threat: Tile | null, enemies: Tile[]): Tile[] =>
  match(card)
    .with('graveyard', () =>
      [3.5, 14.5].flatMap((x): Tile[] => [
        [x, 25.5],
        [x + (x < 9 ? -0.8 : 0.8), 25],
        [x, 24.5],
      ]),
    )
    .with('poison', (): Tile[] => [
      ...(threat ? [threat] : []),
      ...enemies.slice(0, 3),
      [3.5, 25.5],
      [14.5, 25.5],
    ])
    .with('goblin_hut', (): Tile[] => [
      [9, 9],
      [7, 12],
      [11, 12],
      [3.5, 10],
      [14.5, 10],
      [9, 6],
    ])
    .with('barbarian_barrel', 'furnace', 'ice_wizard', 'knight', 'skeletons', (troop): Tile[] => {
      if (!threat) return LANES;
      const gap = troop === 'furnace' || troop === 'ice_wizard' ? 3 : 1;
      return [
        [clamp(threat[0], 0.6, 17.4), clamp(threat[1] - gap, 1, 15)],
        [9, clamp(threat[1] - 1, 2, 13)],
        ...LANES.slice(2),
      ];
    })
    .exhaustive()
    .slice(0, 6);

// 빠른 정책(controller 4)의 후보다. 학습한 시뮬레이터와 같은 규칙으로 만들어 처음 보는 종류의 후보를 비교하지 않는다.
export function fastCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  situation: BattleSituation,
): QwenAction[] {
  const enemies = situation.opponent.units.map((unit): Tile => tilePoint(profile, unit));
  const threat =
    minBy(
      enemies.filter(([, y]) => y < 16),
      ([, y]) => y,
    ) ?? null;
  const plays = cards.flatMap((card, index) => {
    const playable = deckCard(card);
    if (!playable || CARD_INFO[playable].cost > elixir) return [];
    return uniqBy(cardTiles(playable, threat, enemies), ([x, y]) => `${x.toFixed(1)}:${y.toFixed(1)}`)
      .map((tile) => ({ tile, target: screenPoint(profile, tile) }))
      .filter(({ target }) => !blockedDeployment(profile, playable, target, situation))
      .map(({ tile, target }) => ({
        slot: index + 1,
        card: playable,
        target,
        description: `${playable} tile ${tile[0].toFixed(1)},${tile[1].toFixed(1)}`,
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
  // 시뮬레이터처럼 엘릭서 8 이상에서 다른 행동이 있으면 대기를 후보에서 뺀다.
  const wait = { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' };
  return elixir >= 8 && moves.length > 0 ? moves : [wait, ...moves];
}
