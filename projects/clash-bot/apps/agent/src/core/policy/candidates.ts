import type { BattleSituation, FieldUnit } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import type { Point } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import { actionCandidates, type QwenAction } from './actions.ts';
import { ownPoint } from './placement.ts';
import { predictivePlacements } from './predictive-placement.ts';

export function bodyCard(unit: FieldUnit): string | null {
  if (unit.kind) return unit.kind;
  return unit.card;
}
export function affordableCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  situation: BattleSituation,
): QwenAction[] {
  // 후보 판단 계약(controller 3)은 지불 가능한 모든 손패를 비교한다. 유닛 이름이 불확실해도 승리 카드를 지우지 않는다.
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
    const existing = ['ice_wizard', 'barbarian_barrel', 'goblin_hut', 'poison', 'graveyard'].includes(card)
      ? predictivePlacements(profile, card, threats, observed)
      : old.filter((action) => action.card === card && action.kind !== 'ability');
    const fallback = () => {
      if (['barbarian_barrel', 'goblin_hut', 'poison', 'graveyard'].includes(card)) return [];
      return [95, 273].flatMap((x) => {
        const target = ownPoint(profile, card, { x, y: profile.riverY + 85 }, observed);
        return target ? [{ target, description: `${card} lane support` }] : [];
      });
    };
    const unique = new Map(
      [...existing, ...fallback()].map((row) => [
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
