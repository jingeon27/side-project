import { match } from 'ts-pattern';

import type { BattleSituation } from '../../core/battle/battle-state.ts';
import type { CardId } from '../../core/cards.ts';
import { fastCandidates } from '../../core/fast/candidates.ts';
import type { FastPolicy } from '../../core/fast/policy.ts';
import { FAST_TACTICS } from '../../core/fast/tactics.ts';
import type { Point } from '../../core/geometry.ts';
import { actionCandidates, choicePrompt, type QwenAction } from '../../core/policy/actions.ts';
import { affordableCandidates } from '../../core/policy/candidates.ts';
import { decisionContext, decisionPrompt, serializeDecision } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';
import {
  controllerVersionOf,
  type ControllerVersion,
  type DecisionOutput,
  type LearningClient,
} from '../../qwen/learning-client.ts';
import type { MatchSensor, OwnFrame } from './sensor.ts';

export type DecisionInput = {
  profile: Profile;
  cards: Array<CardId | null>;
  elixir: number;
  threats: Point[];
  situation: BattleSituation;
  // 대전 화면을 처음 본 뒤 지난 초다.
  clock: number;
};
export type DecisionRequest = {
  input: DecisionInput;
  candidates: QwenAction[];
  prompt: string;
  imagePath: string;
  featurePath: string;
};

// 판단 계약마다 다른 후보·입력·판단 주체·입력 직전 재확인이다. 경기 한 판은 계약 하나만 쓴다.
// 1·3은 Qwen 체크포인트의 계약이고, 4는 자가대국에서 학습한 빠른 정책이다.
export type Controller = {
  version: ControllerVersion | 4;
  // 빠른 캡처는 알려진 화면 영역만 잘라 찍는다.
  fastCapture: boolean;
  candidates: (input: DecisionInput) => QwenAction[];
  prompt: (input: DecisionInput, candidates: QwenAction[]) => string;
  choose: (request: DecisionRequest) => Promise<DecisionOutput>;
  // 모델이 판단하는 동안 화면을 계속 추적할지 정한다.
  tracksWhileDeciding: boolean;
  // 이 시간을 넘긴 판단은 기록만 하고 입력하지 않는다.
  deadlineMs: number | null;
  latestFrame: (sensor: MatchSensor, before: OwnFrame) => Promise<OwnFrame>;
  // 판단한 화면 뒤에 생긴 상대 무덤은 판단의 전제를 바꾼다.
  newGraveyard: (before: OwnFrame, latest: OwnFrame) => boolean;
};

const graveyardPixelsAppeared = (before: OwnFrame, latest: OwnFrame) =>
  latest.graveyardPresence.some((pixels, index) => pixels >= 350 && before.graveyardPresence[index]! < 350);

const graveyardEffectAppeared = (before: OwnFrame, latest: OwnFrame) =>
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
  ) ?? false;

export function qwenController(version: ControllerVersion, client: LearningClient): Controller {
  const choose = (request: DecisionRequest) =>
    client.choose({
      imagePath: request.imagePath,
      prompt: request.prompt,
      candidates: request.candidates,
      featurePath: request.featurePath,
      controllerVersion: version,
    });
  return match(version)
    .with(1, (): Controller => ({
      version,
      fastCapture: false,
      candidates: (input) =>
        actionCandidates(input.profile, input.cards, input.elixir, input.threats, input.situation),
      prompt: (input, candidates) =>
        choicePrompt(input.cards, input.elixir, input.threats, candidates, 'letter', input.situation),
      choose,
      tracksWhileDeciding: true,
      deadlineMs: null,
      latestFrame: (sensor) => sensor.capture(),
      newGraveyard: graveyardEffectAppeared,
    }))
    .with(3, (): Controller => ({
      version,
      fastCapture: true,
      candidates: (input) =>
        affordableCandidates(input.profile, input.cards, input.elixir, input.threats, input.situation),
      prompt: (input, candidates) =>
        decisionPrompt(input.profile, input.cards, input.elixir, candidates, input.situation),
      choose,
      // Keep observing public plays while the GPU scores actions. Otherwise
      // short-lived spawns disappear from opponent mana/cycle and imitation.
      tracksWhileDeciding: true,
      deadlineMs: 1000,
      latestFrame: (sensor, before) => sensor.recheck(before),
      newGraveyard: graveyardPixelsAppeared,
    }))
    .exhaustive();
}

// 학습 중인 Qwen 체크포인트가 고른 계약이다. 경기 사이에 챔피언과 후보가 바뀌므로 경기마다 다시 읽는다.
export const controllerFor = async (client: LearningClient) =>
  qwenController(controllerVersionOf(await client.status()), client);

// 자가대국에서 학습한 작은 정책이 이 컴퓨터에서 바로 판단한다. Qwen 프로세스를 쓰지 않는다.
export function fastController(policy: FastPolicy): Controller {
  const context = (input: DecisionInput, candidates: QwenAction[]) =>
    decisionContext(input.profile, input.cards, input.elixir, candidates, input.situation, input.clock);
  return {
    version: 4,
    fastCapture: true,
    candidates: (input) => fastCandidates(input.profile, input.cards, input.elixir, input.situation),
    prompt: (input, candidates) => serializeDecision(context(input, candidates)),
    choose: async (request) => {
      const started = performance.now();
      const decision = policy.predict(context(request.input, request.candidates));
      const best = decision.choice;
      return {
        text: JSON.stringify({ choice: request.candidates[best]!.id }),
        elapsedMs: Math.round(performance.now() - started),
        peakGb: 0,
        behavior: {
          policy: 'fast',
          version: policy.version,
          weightsSHA256: policy.sha256,
          probabilities: decision.probabilities,
          mechanics: { format: FAST_TACTICS.format, bias: decision.mechanicsBias },
          value: decision.value,
        },
      };
    },
    tracksWhileDeciding: false,
    deadlineMs: 100,
    latestFrame: (sensor, before) => sensor.recheck(before),
    newGraveyard: graveyardPixelsAppeared,
  };
}
