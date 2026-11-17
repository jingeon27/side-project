import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { range, sum, sumBy } from 'es-toolkit';
import { z } from 'zod';

import { CARD_CATALOGUE } from '../card-catalogue.ts';
import type { DecisionContext } from '../policy/decision-v3.ts';
import { towerDefense, type TowerDefenseInput } from '../policy/tower-defense.ts';
import { cardChoice } from './choice.ts';
import { ACTION_SIZE, actionFeatures, contextFeatures, FAST_POLICY, STATE_SIZE } from './features.ts';

// 빠른 정책의 가중치·체크섬·추론이다. Python(clash_bot.arena.policy.network)이 같은 파일을 쓴다.
const { hidden, attention } = FAST_POLICY;

const SHAPES = {
  'action.bias': [attention],
  'action.weight': [attention, ACTION_SIZE],
  'encoder.bias': [hidden],
  'encoder.weight': [hidden, STATE_SIZE],
  'query.bias': [attention],
  'query.weight': [attention, hidden],
  'value.bias': [1],
  'value.weight': [1, hidden],
} satisfies Record<string, number[]>;
type WeightName = keyof typeof SHAPES;
export type FastWeights = Record<WeightName, Float64Array>;
const WEIGHT_NAMES = Object.keys(SHAPES).toSorted() as WeightName[];

const policyFileSchema = z.looseObject({
  format: z.literal(FAST_POLICY.format),
  choice: z.literal(FAST_POLICY.choice),
  stateSize: z.literal(STATE_SIZE),
  actionSize: z.literal(ACTION_SIZE),
  weightsSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  catalogue: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.int().nonnegative().optional(),
  rulesID: z.string().optional(),
  weights: z.record(
    z.string(),
    z.strictObject({ shape: z.array(z.int().positive()), values: z.array(z.number()) }),
  ),
});

// Python과 같은 순서(이름순, 이름 바이트 + float32 값)로 가중치를 해시한다.
export function weightsChecksum(weights: FastWeights) {
  const digest = createHash('sha256');
  for (const name of WEIGHT_NAMES) {
    digest.update(name);
    digest.update(Buffer.from(new Float32Array(weights[name]).buffer));
  }
  return digest.digest('hex');
}

const relu = (value: number) => Math.max(0, value);
// 행렬 [rows, columns]의 한 행과 입력의 곱이다. columns는 값이 있는 칸만 넘긴다.
const dot = (matrix: Float64Array, row: number, width: number, columns: number[], input: ArrayLike<number>) =>
  sumBy(columns, (column) => matrix[row * width + column]! * input[column]!);

// 상태 특징은 대부분 0이라 값이 있는 칸만 곱한다. 한 번의 판단은 1ms 안쪽이다.
export function forward(weights: FastWeights, state: Float64Array, actions: Float64Array[]) {
  const active = range(STATE_SIZE).filter((index) => state[index] !== 0);
  const h = range(hidden).map((row) =>
    relu(dot(weights['encoder.weight'], row, STATE_SIZE, active, state) + weights['encoder.bias'][row]!),
  );
  const everyHidden = range(hidden);
  const query = range(attention).map(
    (row) => dot(weights['query.weight'], row, hidden, everyHidden, h) + weights['query.bias'][row]!,
  );
  const everyAction = range(ACTION_SIZE);
  const logits = actions.map(
    (action) =>
      sum(
        query.map(
          (q, row) =>
            q *
            relu(
              dot(weights['action.weight'], row, ACTION_SIZE, everyAction, action) +
                weights['action.bias'][row]!,
            ),
        ),
      ) / Math.sqrt(attention),
  );
  const top = Math.max(...logits);
  const exponents = logits.map((logit) => Math.exp(logit - top));
  const total = sum(exponents);
  const value = Math.tanh(
    dot(weights['value.weight'], 0, hidden, everyHidden, h) + weights['value.bias'][0]!,
  );
  return { logits, probabilities: exponents.map((item) => item / total), value };
}

export class FastPolicy {
  readonly weights: FastWeights;
  readonly version: number | null;
  readonly sha256: string;
  constructor(weights: FastWeights, version: number | null) {
    this.weights = weights;
    this.version = version;
    this.sha256 = weightsChecksum(weights);
  }

  static async load(path: string) {
    const file = policyFileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    // 다른 카드 카탈로그로 학습한 가중치는 같은 카드를 다른 숫자로 읽는다.
    if (file.catalogue !== CARD_CATALOGUE.id)
      throw new Error(
        `${path}: 빠른 정책이 학습한 카드 카탈로그(${file.catalogue.slice(0, 12)})가 현재 계약(${CARD_CATALOGUE.id.slice(0, 12)})과 다릅니다.`,
      );
    if (Object.keys(file.weights).toSorted().join() !== WEIGHT_NAMES.join())
      throw new Error(`${path}: 빠른 정책의 가중치 이름이 계약과 다릅니다.`);
    const weights = Object.fromEntries(
      WEIGHT_NAMES.map((name) => {
        const item = file.weights[name]!;
        if (
          item.shape.join() !== SHAPES[name].join() ||
          item.values.length !== SHAPES[name].reduce((a, b) => a * b)
        )
          throw new Error(`${path}: 빠른 정책의 ${name} 형태가 계약과 다릅니다.`);
        return [name, Float64Array.from(item.values)];
      }),
    ) as FastWeights;
    const policy = new FastPolicy(weights, file.version ?? null);
    if (policy.sha256 !== file.weightsSHA256)
      throw new Error(`${path}: 빠른 정책 가중치의 체크섬이 맞지 않습니다.`);
    return policy;
  }

  predict(context: DecisionContext, protection?: TowerDefenseInput) {
    const result = forward(this.weights, contextFeatures(context), actionFeatures(context));
    const families = context.actions.map((row) => (row[1] === 'card' ? `card:${row[2]}` : row[1]));
    if (!protection)
      return {
        ...result,
        choice: cardChoice(families, result.probabilities),
        towerProtection: undefined,
      };
    if (
      protection.actions.length !== result.logits.length ||
      protection.actions.some(
        (action, index) => action.id !== index || action.card !== context.actions[index]?.[2],
      )
    )
      throw new Error('타워 수비 후보와 정책 후보의 순서가 다릅니다.');
    const towerProtection = towerDefense(protection);
    const logits = result.logits.map((logit, index) => logit + (towerProtection.actions[index]?.bias ?? 0));
    const top = Math.max(...logits);
    const exponents = logits.map((logit) => Math.exp(logit - top));
    const total = sum(exponents);
    const probabilities = exponents.map((value) => value / total);
    return {
      ...result,
      logits,
      probabilities,
      choice: cardChoice(families, probabilities),
      towerProtection,
    };
  }
}
