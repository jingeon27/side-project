import { CARD_INFO, type CardId } from '../../core/cards.ts';
import type { Point } from '../../core/geometry.ts';
import { blockedDeployment } from '../../core/placement/placement.ts';
import type { Profile } from '../../core/profile.ts';
import { difference } from '../perception/hand.ts';

// 손패 칸의 지문까지 담은, 판단 직전과 입력 직전의 화면 요약이다.
export type FreshBattle = { battle: boolean; elixir: number; hand: number[][]; capturedAt: number };

// 판단에 쓴 화면과 입력 직전 화면을 다시 대조한다. 전투가 끝났거나 손패·자원이 바뀌었거나
// 늦었거나 놓을 수 없는 자리면 입력하지 않는다. slot은 1~4이며 반환값의 slot은 손패 칸 번호(0~3)다.
export function confirmPlacement(
  placement: { slot: number; target: Point },
  cards: Array<CardId | null>,
  before: FreshBattle,
  latest: FreshBattle,
  profile: Profile,
  now: number,
): { slot: number; card: CardId; target: Point } | null {
  if (
    placement.slot === 0 ||
    !before.battle ||
    !latest.battle ||
    now - before.capturedAt > 8000 ||
    now - latest.capturedAt > 1500
  )
    return null;
  const slot = placement.slot - 1;
  const card = cards[slot];
  if (
    !card ||
    !profile.deck.includes(card) ||
    latest.elixir < CARD_INFO[card].cost ||
    before.elixir < CARD_INFO[card].cost ||
    difference(before.hand[slot] ?? [], latest.hand[slot] ?? []) > 12
  )
    return null;
  const target = { x: Math.round(placement.target.x), y: Math.round(placement.target.y) };
  const arena = profile.arena;
  if (
    target.x < arena.x ||
    target.x >= arena.x + arena.width ||
    target.y < arena.y ||
    target.y >= arena.y + arena.height ||
    blockedDeployment(profile, card, target) ||
    (CARD_INFO[card].role !== 'spell' && target.y <= profile.riverY + 8)
  )
    return null;
  return { slot, card, target };
}
