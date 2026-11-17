import { createHash } from 'node:crypto';

import type { DecisionContext } from '../core/policy/decision-v3.ts';
import {
  actionFeatures,
  contextFeatures,
  FastPolicy,
  forward,
  STATE_SIZE,
} from '../core/policy/fast-policy.ts';
import type { TowerDefenseInput } from '../core/policy/tower-defense.ts';
import { TROPHY_LEARNING, type TrophySnapshot, type TrophyTransition } from './protocol.ts';

export function trophyProbabilities(
  logits: number[],
  bias: number[],
  temperature: number,
  exploration: number,
) {
  if (
    logits.length !== bias.length ||
    !logits.length ||
    !Number.isFinite(temperature) ||
    !Number.isFinite(exploration) ||
    temperature < 0.25 ||
    temperature > 2 ||
    exploration < 0 ||
    exploration > 0.1
  )
    throw new Error('트로피 정책의 선택 인자가 잘못됐습니다.');
  const scores = logits.map((v, i) => (v + (bias[i] ?? 0)) / temperature);
  if (scores.some((v) => !Number.isFinite(v))) throw new Error('선택 점수가 유한하지 않습니다.');
  const best = Math.max(...scores),
    exp = scores.map((v) => Math.exp(v - best));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => ((1 - exploration) * v) / total + exploration / exp.length);
}

// One immutable checkpoint per game. The learner never mutates this instance.
export class TrophyActor {
  readonly policy: FastPolicy;
  readonly snapshot: TrophySnapshot;
  constructor(policy: FastPolicy, snapshot: TrophySnapshot) {
    this.policy = policy;
    this.snapshot = snapshot;
    if (policy.sha256 !== snapshot.weightsSHA256 || policy.version !== snapshot.version)
      throw new Error('트로피 경기 모델이 체크포인트와 다릅니다.');
  }
  verify(sample: TrophyTransition) {
    const state = new Float64Array(STATE_SIZE);
    sample.features.index.forEach((index, i) => {
      state[index] = sample.features.value[i] ?? 0;
    });
    const raw = forward(
      this.policy.weights,
      state,
      sample.actionFeatures.map((row) => Float64Array.from(row)),
    );
    const expected = trophyProbabilities(raw.logits, sample.bias, sample.temperature, sample.exploration);
    if (
      expected.some((p, i) => Math.abs(p - (sample.probabilities[i] ?? 0)) > 2e-5) ||
      Math.abs(raw.value - sample.value) > 2e-4
    )
      throw new Error('기록한 선택 확률·가치가 고정 모델과 다릅니다.');
  }
  decide(
    context: DecisionContext,
    protection: TowerDefenseInput,
    mechanicsBias: number[],
    frame: { at: number; image: string; bytes: Buffer },
    random = Math.random,
  ) {
    const base = this.policy.predict(context);
    const defended = this.policy.predict(context, protection);
    if (mechanicsBias.length !== base.logits.length) throw new Error('사전 보정과 후보 수가 다릅니다.');
    const bias = mechanicsBias.map((v, i) => v + (defended.towerProtection?.actions[i]?.bias ?? 0));
    const temperature = defended.towerProtection?.urgent
      ? TROPHY_LEARNING.selection.urgentTemperature
      : TROPHY_LEARNING.selection.temperature;
    const exploration = TROPHY_LEARNING.selection.exploration;
    const probabilities = trophyProbabilities(base.logits, bias, temperature, exploration);
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
      throw new Error('난수는 0 이상 1 미만이어야 합니다.');
    const accumulated = probabilities.map((_, i) => probabilities.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const found = accumulated.findIndex((v) => v > draw);
    const chosen = found < 0 ? probabilities.length - 1 : found;
    const dense = contextFeatures(context);
    const index = Array.from(dense.keys()).filter((i) => dense[i] !== 0);
    const draft: Omit<TrophyTransition, 'confirmation'> = {
      at: frame.at,
      image: frame.image,
      imageSHA256: createHash('sha256').update(frame.bytes).digest('hex'),
      features: { index, value: index.map((i) => dense[i] ?? 0) },
      actionFeatures: actionFeatures(context).map((row) => Array.from(row)),
      bias,
      temperature,
      exploration,
      probabilities,
      chosen,
      value: base.value,
    };
    return { chosen, draft, towerProtection: defended.towerProtection };
  }
}
