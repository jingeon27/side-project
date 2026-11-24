import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { CARD_CATALOGUE } from '../card-catalogue.ts';
import type { DecisionContext } from '../policy/decision-v3.ts';
import { cardChoice, placementCountBias } from './choice.ts';
import { ACTION_SIZE, actionFeatures, contextFeatures, FAST_POLICY, STATE_SIZE } from './features.ts';
import { forward, WEIGHT_SHAPES, type FastWeights } from './network.ts';
import { fastActionBias } from './tactics.ts';

type WeightName = keyof typeof WEIGHT_SHAPES;
export { forward, type FastWeights } from './network.ts';

const WEIGHT_NAMES = Object.keys(WEIGHT_SHAPES).toSorted() as WeightName[];

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
          item.shape.join() !== WEIGHT_SHAPES[name].join() ||
          item.values.length !== WEIGHT_SHAPES[name].reduce((a, b) => a * b)
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

  predict(context: DecisionContext) {
    const families = context.actions.map((row) => (row[1] === 'card' ? `card:${row[2]}` : row[1]));
    const mechanicsBias = fastActionBias(context);
    const scores = placementCountBias(families).map((bias, index) => bias + mechanicsBias[index]!);
    const result = forward(this.weights, contextFeatures(context), actionFeatures(context), scores);
    return {
      ...result,
      choice: cardChoice(families, result.probabilities),
      mechanicsBias,
    };
  }
}
