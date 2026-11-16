import { readFileSync } from 'node:fs';

import { actionCandidates, type QwenAction } from '../../game/actions.ts';
import { ownPoint } from '../../game/placement.ts';
import { CARD_INFO, type CardId, type Point, type Profile } from '../../shared/config.ts';
import type { BattleSituation, FieldUnit } from '../domain/battle-state.ts';

const contract = JSON.parse(
  readFileSync(new URL('../../../contracts/decision-v2.json', import.meta.url), 'utf8'),
) as {
  header: string;
};
export function bodyCard(unit: FieldUnit): string | null {
  if (unit.kind) return unit.kind;
  return unit.card;
}
export const tilePoint = (profile: Profile, point: Point) => [
  Math.round((9 + ((point.x - 184) * 11) / 178) * 10) / 10,
  Math.round((16 - ((point.y - profile.riverY) * 9.5) / 130) * 10) / 10,
];

export function candidatesV2(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  situation: BattleSituation,
): QwenAction[] {
  // Preserve the old controller for the deployed baseline. V2 admits every
  // affordable card; uncertain unit identity cannot remove the win condition.
  const normalize = (unit: FieldUnit) => ({
    ...unit,
    card: (['knight', 'furnace', 'ice_wizard', 'goblin_hut'].includes(bodyCard(unit) ?? '')
      ? bodyCard(unit)
      : unit.card) as CardId | null,
  });
  const observed = {
    ...situation,
    own: { ...situation.own, units: situation.own.units.map(normalize) },
    opponent: { ...situation.opponent, units: situation.opponent.units.map(normalize) },
  };
  const old = actionCandidates(profile, cards, elixir, threats, observed);
  const byCard = cards.flatMap((card, index) => {
    if (!card || CARD_INFO[card].cost > elixir) return [];
    const existing = old.filter((action) => action.card === card && action.kind !== 'ability');
    const fallback =
      card === 'graveyard' || card === 'poison'
        ? [95, 273].map((x) => ({
            target: { x, y: profile.arena.y + 60 },
            description: `${card} tower; compare support and defense`,
          }))
        : [95, 273]
            .map((x) => ({
              target: ownPoint(profile, card, { x, y: profile.riverY + 85 }, observed)!,
              description: `${card} lane support`,
            }))
            .filter((row) => row.target);
    const unique = new Map(
      [...existing, ...fallback].map((row) => [
        `${Math.round(row.target.x)}:${Math.round(row.target.y)}`,
        row,
      ]),
    );
    return [...unique.values()]
      .slice(0, 5)
      .map((row) => ({ slot: index + 1, card, target: row.target, description: row.description }));
  });
  return [
    { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait; compare leak and defense' },
    ...[...byCard, ...old.filter((action) => action.kind === 'ability')].map((row, index) => ({
      ...row,
      id: index + 1,
    })),
  ];
}

export function compactPrompt(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  situation: BattleSituation,
) {
  const row = (unit: FieldUnit) => [bodyCard(unit) ?? '?', ...tilePoint(profile, unit), unit.variant ?? '?'];
  const own = situation.own.units
    .toSorted((a, b) => a.y - b.y)
    .slice(0, 5)
    .map(row);
  const enemy = situation.opponent.units
    .toSorted((a, b) => b.y - a.y)
    .slice(0, 8)
    .map(row);
  return (
    contract.header +
    JSON.stringify({
      hand: cards,
      elixir: Math.round(elixir * 10) / 10,
      enemyElixir: situation.opponent.elixir,
      next: situation.own.cycle?.nextDraw,
      own,
      enemy,
      effects: situation.effects
        ?.slice(0, 4)
        .map((e) => [e.side, e.card, ...tilePoint(profile, e), Math.round(e.visibleAgeMs / 1000)]),
      skill: situation.own.ability?.availability,
      actions: actions.map((a, i) => [
        String.fromCharCode(65 + i),
        a.kind ?? (a.card ? 'card' : 'wait'),
        a.card,
        a.cost ?? (a.card ? CARD_INFO[a.card].cost : 0),
        ...tilePoint(profile, a.target),
      ]),
    })
  );
}
