import type { BattleSituation } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import type { Point } from '../geometry.ts';
import { graveyardThreat, ownPoint, unitPlacements, type PlacementOption } from '../placement/placement.ts';
import type { Profile } from '../profile.ts';

export type ActionOption = {
  id: number;
  slot: number;
  card: CardId | null;
  target: Point;
  description: string;
  kind?: 'ability';
  cost?: number;
  abilityInstance?: number;
};

export function actionCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  situation?: BattleSituation,
): ActionOption[] {
  const nearest = threats.toSorted((a, b) => b.y - a.y)[0];
  const graveyard = graveyardThreat(profile, situation);
  const cluster = threats
    .map((point) => threats.filter((other) => Math.hypot(other.x - point.x, other.y - point.y) <= 60))
    .toSorted((first, second) => second.length - first.length)[0];
  const poisonDefense =
    situation && cluster?.length
      ? {
          x: cluster.reduce((sum, point) => sum + point.x, 0) / cluster.length,
          y: cluster.reduce((sum, point) => sum + point.y, 0) / cluster.length,
        }
      : nearest;
  const enemyTower = (x: number) => ({ x, y: profile.arena.y + 60 });
  const supported = (x: number) =>
    !situation ||
    situation.own.units.some(
      (ally) =>
        ['knight', 'furnace'].includes(ally.card ?? '') &&
        ally.confidence >= 0.85 &&
        ally.y < profile.riverY + 65 &&
        ally.x < 184 === x < 184,
    ) ||
    (threats.length === 0 && elixir >= 8 && situation.opponent.elixir.max <= 3);
  const recentGraveyards =
    situation?.own.recentPlays.filter(
      (play) => play.card === 'graveyard' && situation.at - play.at < 12_000,
    ) ?? [];
  const moves = cards.flatMap((card, index) => {
    if (!card || CARD_INFO[card].cost > elixir) return [];
    const targets: PlacementOption[] =
      card === 'graveyard'
        ? [95, 273]
            .filter(supported)
            .flatMap((x) => [
              {
                target: enemyTower(x),
                description: `Graveyard ${x < 184 ? 'left' : 'right'} tower center with advancing support`,
              },
              {
                target: { x: x + (x < 184 ? -20 : 20), y: profile.arena.y + 70 },
                description: 'Graveyard outer offset; consider fixed spawn order and defenders',
              },
              {
                target: { x, y: profile.arena.y + 85 },
                description: 'Graveyard forward offset; compare defenders and tank arrival',
              },
            ])
            .slice(0, 5)
        : card === 'poison'
          ? [
              ...(graveyard &&
              !situation?.own.recentPlays.some(
                (play) =>
                  play.card === 'poison' &&
                  situation.at - play.at < 6000 &&
                  Math.hypot(play.target.x - graveyard.x, play.target.y - graveyard.y) < 45,
              )
                ? [
                    {
                      target: { x: graveyard.x, y: graveyard.y },
                      description:
                        'defensive Poison covering active Graveyard; compare remaining spawn phase, 8s Poison and 9s Graveyard reference durations',
                    },
                  ]
                : []),
              ...(poisonDefense && (!situation || (cluster?.length ?? 0) >= 3)
                ? [
                    {
                      target: ownPoint(profile, card, poisonDefense)!,
                      description: 'Poison clustered invading troops',
                    },
                  ].filter((item) => item.target)
                : []),
              ...recentGraveyards.flatMap((play) => {
                const defender = situation!.opponent.units
                  .filter(
                    (unit) =>
                      unit.confidence >= 0.75 &&
                      Math.hypot(unit.x - play.target.x, unit.y - play.target.y) < 95,
                  )
                  .toSorted((first, second) => second.confidence - first.confidence)[0];
                return [
                  { target: play.target, description: 'Poison support on the active Graveyard location' },
                  ...(defender
                    ? [
                        {
                          target: { x: defender.x, y: defender.y },
                          description: `Poison observed ${defender.kind ?? defender.card ?? 'defender'} near Graveyard`,
                        },
                      ]
                    : []),
                ];
              }),
              ...(situation?.opponent.units
                .filter(
                  (unit) =>
                    ['furnace', 'goblin_hut', 'ice_wizard'].includes(unit.card ?? '') &&
                    unit.confidence >= 0.85 &&
                    situation.own.units.some((ally) => Math.hypot(ally.x - unit.x, ally.y - unit.y) < 110),
                )
                .slice(0, 1)
                .map((unit) => ({
                  target: { x: unit.x, y: unit.y },
                  description:
                    'Poison supporting defenders/spawner engaged with our troops; compare travel speed and remaining exposure',
                })) ?? []),
              ...(!situation
                ? [95, 273].map((x) => ({ target: enemyTower(x), description: 'Poison enemy tower' }))
                : []),
            ].slice(0, 5)
          : CARD_INFO[card].role === 'spell' && card !== 'barbarian_barrel'
            ? nearest
              ? [{ target: nearest, description: `${card} invading troops` }]
              : [95, 273].map((x) => ({ target: enemyTower(x), description: `${card} enemy tower` }))
            : unitPlacements(profile, card, threats, situation);
    const adjusted = targets.map((item) =>
      item.target.x > 306 && item.target.y > 454
        ? { ...item, target: { x: item.target.x - 40, y: item.target.y } }
        : item,
    );
    const unique = new Map(
      adjusted.map((item) => [`${Math.round(item.target.x)}:${Math.round(item.target.y)}`, item]),
    );
    return [...unique.values()]
      .filter(
        (item) =>
          item.target.x >= profile.arena.x &&
          item.target.x < profile.arena.x + profile.arena.width &&
          item.target.y >= profile.arena.y &&
          item.target.y < profile.arena.y + profile.arena.height,
      )
      .map((item) => ({ slot: index + 1, card, ...item }));
  });
  const ability = situation?.own.ability;
  const abilityMoves: Omit<ActionOption, 'id'>[] =
    ability?.availability === 'ready' && ability.cost <= elixir
      ? [
          {
            slot: 0,
            card: ability.card,
            kind: 'ability',
            cost: ability.cost,
            abilityInstance: ability.instance,
            target: ability.target,
            description:
              'Frosty Fella hero ability: spend 2 elixir without drawing a card. Freeze already slowed targets; compare nearby threats, snowman survival and saving elixir. Once per deployment.',
          },
        ]
      : [];
  const actions = [...moves, ...abilityMoves].map((item, index) => ({ id: index + 1, ...item }));
  return ((!nearest || graveyard) && elixir < 8) || actions.length === 0
    ? [
        {
          id: 0,
          slot: 0,
          card: null,
          target: { x: 0, y: 0 },
          description: 'wait and observe elixir/spawn timing',
        },
        ...actions,
      ]
    : actions;
}
