import type { CardId } from '../cards.ts';
import type { BattleMemory, BattleSituation } from './battle-state.ts';
import type { FieldDynamics } from './field-dynamics.ts';
import type { HeroAbility } from './special-state.ts';

export type FrameReading = {
  at: number;
  hand: Array<CardId | null>;
  elixir: { amount: number; range: { min: number; max: number } };
  elixirConfidence: number;
  inputPending: boolean;
  ability?: HeroAbility;
  field: ReturnType<FieldDynamics['observe']>;
};

const UNKNOWN = { min: 0, max: 10 };

// 화면 한 장의 판독으로 행동 전 상황을 만든다. 실시간 경기와 저장 기록의 재인식이 같은 규칙을 쓴다.
// 입력 중이거나 막대 판독을 믿을 수 없으면 내 엘릭서를 모르는 값으로 둔다.
export function observeFrame(memory: BattleMemory, frame: FrameReading): BattleSituation {
  const reliable = frame.elixirConfidence >= 0.9;
  const situation = memory.observe({
    at: frame.at,
    amount: frame.elixir.amount,
    hand: frame.hand,
    inputPending: frame.inputPending,
    elixirReliable: reliable,
    elixirRange: frame.elixir.range,
    allies: frame.field.allies,
    enemies: frame.field.enemies,
    effects: frame.field.effects,
    spawners: frame.field.spawners,
    ability: frame.ability,
  });
  situation.own.elixir = !frame.inputPending && reliable ? frame.elixir.range : UNKNOWN;
  if (!reliable) situation.opponent.elixir = UNKNOWN;
  return situation;
}

// 이 화면에서 확인한 상대 행동까지 반영한 상대 엘릭서·순환·진화 추정을 덧붙인다.
// 이미 저장한 이전 화면의 상황은 바꾸지 않아 학습 자료에 이후 정보가 섞이지 않는다.
export function settleOpponent(
  memory: BattleMemory,
  situation: BattleSituation,
  frame: Pick<FrameReading, 'at' | 'inputPending' | 'elixirConfidence'>,
) {
  const ledger = memory.elixir.snapshot(frame.at);
  Object.assign(situation.opponent, {
    elixir: frame.inputPending || frame.elixirConfidence < 0.9 ? UNKNOWN : ledger.opponent,
    cycle: memory.opponentCycle.snapshot(),
    evolutions: memory.opponentEvolutions.snapshot(),
    seenSpent: ledger.opponentSeenSpent,
  });
}
