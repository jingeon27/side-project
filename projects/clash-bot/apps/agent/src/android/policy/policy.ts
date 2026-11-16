import { CARD_INFO, type CardId, type Point, type Profile } from '../../shared/config.ts';
import type { HandCard, Observation } from '../perception/vision.ts';

export type Decision = { slot: number; card: CardId; target: Point; reason: string };
export type PolicyState = { actions: number; lastActionAt: number };

export function decide(
  observation: Observation,
  profile: Profile,
  state: PolicyState,
  now: number,
): Decision | null {
  if (
    !observation.inBattle ||
    observation.elixirConfidence < 0.85 ||
    now - observation.capturedAt > 1500 ||
    now - state.lastActionAt < 2500
  )
    return null;
  const playable = observation.hand.filter((item): item is HandCard & { card: CardId } =>
    Boolean(item.card && item.ready && CARD_INFO[item.card].cost <= observation.elixir),
  );
  const threats = observation.enemies
    .filter((enemy) => enemy.y > profile.riverY + 8)
    .sort((a, b) => b.y - a.y);
  const threat = threats[0];
  const constrain = (point: Point, spell: boolean): Point => ({
    x: Math.max(profile.arena.x + 10, Math.min(profile.arena.x + profile.arena.width - 10, point.x)),
    y: Math.max(
      spell ? profile.arena.y + 10 : profile.riverY + 18,
      Math.min(profile.arena.y + profile.arena.height - 25, point.y),
    ),
  });
  const action = (card: HandCard & { card: CardId }, target: Point, reason: string): Decision => ({
    slot: card.slot,
    card: card.card,
    target: constrain(target, CARD_INFO[card.card].role === 'spell'),
    reason,
  });
  if (threat) {
    const cluster = threats.filter((other) => Math.hypot(other.x - threat.x, other.y - threat.y) < 45);
    const spell = playable.find((item) => CARD_INFO[item.card].role === 'spell' && item.card !== 'graveyard');
    if (spell && cluster.length >= 3)
      return action(
        spell,
        {
          x: cluster.reduce((sum, item) => sum + item.x, 0) / cluster.length,
          y: cluster.reduce((sum, item) => sum + item.y, 0) / cluster.length,
        },
        '내 진영의 밀집한 적 체력 막대에 범위 마법',
      );
    const defender =
      playable.find((item) => CARD_INFO[item.card].role === 'defender') ??
      playable.find((item) => CARD_INFO[item.card].role === 'support') ??
      playable.find((item) => CARD_INFO[item.card].role === 'cycle');
    if (defender)
      return action(
        defender,
        { x: threat.x + (threat.x < 184 ? 12 : -12), y: threat.y + 22 },
        '내 진영으로 들어온 적을 타워 앞에서 수비',
      );
    return null;
  }
  if (observation.elixir < 7) return null;
  const laneX = state.actions % 2 === 0 ? 95 : 273;
  const advancing = observation.allies.find(
    (ally) => ally.y > profile.riverY - 25 && ally.y < profile.riverY + 65,
  );
  const graveyard = playable.find((item) => item.card === 'graveyard');
  if (graveyard && advancing && observation.elixir >= 8)
    return action(
      graveyard,
      {
        x: advancing.x < 184 ? 95 : 273,
        y: profile.arena.y + (profile.riverY - profile.arena.y) * 0.45,
      },
      '다리 근처 아군이 있을 때 상대 타워에 무덤 공격',
    );
  const support = advancing && playable.find((item) => CARD_INFO[item.card].role === 'support');
  if (support)
    return action(support, { x: advancing.x, y: profile.riverY + 48 }, '다리 근처 아군 뒤에 원거리 지원');
  const tank = playable.find((item) => CARD_INFO[item.card].role === 'tank');
  if (tank)
    return action(
      tank,
      {
        x: laneX,
        y: tank.card === 'hog_rider' ? profile.riverY + 24 : profile.arena.y + profile.arena.height - 35,
      },
      '엘릭서 여유가 생겨 공격 유닛 배치',
    );
  const cycle = playable
    .filter((item) => CARD_INFO[item.card].role !== 'spell')
    .sort((a, b) => CARD_INFO[a.card].cost - CARD_INFO[b.card].cost)[0];
  return cycle
    ? action(
        cycle,
        { x: laneX, y: profile.arena.y + profile.arena.height - 35 },
        '엘릭서가 넘치기 전에 저비용 카드 순환',
      )
    : null;
}

export function assertDecision(decision: Decision, observation: Observation, profile: Profile): void {
  const card = observation.hand[decision.slot];
  const { target } = decision;
  if (
    !observation.inBattle ||
    !card?.ready ||
    card.card !== decision.card ||
    observation.elixir < CARD_INFO[decision.card].cost
  )
    throw new Error('최신 화면에서 선택 카드를 확인하지 못했습니다.');
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    target.x < profile.arena.x ||
    target.x >= profile.arena.x + profile.arena.width ||
    target.y < profile.arena.y ||
    target.y >= profile.arena.y + profile.arena.height
  )
    throw new Error('배치 위치가 아레나를 벗어났습니다.');
  if (CARD_INFO[decision.card].role !== 'spell' && target.y <= profile.riverY + 8)
    throw new Error('유닛 배치 위치가 내 진영이 아닙니다.');
}
