import type { BattleSituation } from '../../core/battle/battle-state.ts';
import type { CardId } from '../../core/cards.ts';
import type { Point } from '../../core/geometry.ts';
import { actionCandidates, choicePrompt, type QwenAction } from '../../core/policy/actions.ts';
import { affordableCandidates } from '../../core/policy/candidates.ts';
import { decisionPrompt } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';
import type { ControllerVersion } from '../../qwen/learning-client.ts';
import type { MatchSensor, OwnFrame } from './sensor.ts';

export type DecisionInput = {
  profile: Profile;
  cards: Array<CardId | null>;
  elixir: number;
  threats: Point[];
  situation: BattleSituation;
};

// 판단 계약마다 다른 후보·입력 문자열·입력 직전 재확인이다. 경기 한 판은 체크포인트의 계약 하나만 쓴다.
export type Controller = {
  version: ControllerVersion;
  // 빠른 캡처는 알려진 화면 영역만 잘라 찍는다.
  fastCapture: boolean;
  candidates: (input: DecisionInput) => QwenAction[];
  prompt: (input: DecisionInput, candidates: QwenAction[]) => string;
  // 모델이 판단하는 동안 화면을 계속 추적할지 정한다.
  tracksWhileDeciding: boolean;
  // 이 시간을 넘긴 판단은 기록만 하고 입력하지 않는다.
  deadlineMs: number | null;
  latestFrame: (sensor: MatchSensor, before: OwnFrame) => Promise<OwnFrame>;
  // 판단한 화면 뒤에 생긴 상대 무덤은 판단의 전제를 바꾼다.
  newGraveyard: (before: OwnFrame, latest: OwnFrame) => boolean;
};

export const CONTROLLERS: Record<ControllerVersion, Controller> = {
  1: {
    version: 1,
    fastCapture: false,
    candidates: (input) =>
      actionCandidates(input.profile, input.cards, input.elixir, input.threats, input.situation),
    prompt: (input, candidates) =>
      choicePrompt(input.cards, input.elixir, input.threats, candidates, 'letter', input.situation),
    tracksWhileDeciding: true,
    deadlineMs: null,
    latestFrame: (sensor) => sensor.capture(),
    newGraveyard: (before, latest) =>
      latest.situation.effects?.some(
        (effect) =>
          effect.side === 'red' &&
          effect.card === 'graveyard' &&
          !before.situation.effects?.some(
            (old) =>
              old.side === effect.side &&
              old.card === effect.card &&
              Math.hypot(old.x - effect.x, old.y - effect.y) < 55,
          ),
      ) ?? false,
  },
  3: {
    version: 3,
    fastCapture: true,
    candidates: (input) =>
      affordableCandidates(input.profile, input.cards, input.elixir, input.threats, input.situation),
    prompt: (input, candidates) =>
      decisionPrompt(input.profile, input.cards, input.elixir, candidates, input.situation),
    tracksWhileDeciding: false,
    deadlineMs: 1000,
    latestFrame: (sensor, before) => sensor.recheck(before),
    newGraveyard: (before, latest) =>
      latest.graveyardPresence.some(
        (pixels, index) => pixels >= 350 && before.graveyardPresence[index]! < 350,
      ),
  },
};
