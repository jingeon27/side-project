import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { clamp, range, sum, sumBy } from 'es-toolkit';
import { match } from 'ts-pattern';
import { z } from 'zod';

import {
  BODY_SIZE,
  bodyVector,
  CARD_CATALOGUE,
  CARD_SIZE,
  catalogueCard,
  isCatalogueBody,
} from '../card-catalogue.ts';
import type { DecisionAction, DecisionContext } from './decision-v3.ts';
import { towerDefense, type TowerDefenseInput } from './tower-defense.ts';

// 판단 문맥의 특징 배치다. Python(clash_bot.arena.fast_features)이 같은 계약으로 같은 숫자를 만든다.
// 카드와 필드 오브젝트는 이름 칸이 아니라 카드 카탈로그의 특징으로 들어가 덱이 바뀌어도 가중치 모양이 같다.
export const FAST_POLICY = z
  .strictObject({
    format: z.literal('clash-fast-policy-v3'),
    grid: z.strictObject({
      columns: z.int().positive(),
      rows: z.int().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    clockSeconds: z.number().positive(),
    hidden: z.int().positive(),
    attention: z.int().positive(),
  })
  .parse(JSON.parse(readFileSync(new URL('../../../contracts/fast-policy.json', import.meta.url), 'utf8')));

const { grid, hidden, attention } = FAST_POLICY;
const CELLS = grid.columns * grid.rows;
const OFFSET = {
  towersKnown: 5,
  ownTowers: 6,
  enemyTowers: 9,
  hand: 12,
  next: 12 + CARD_SIZE,
  field: 12 + 2 * CARD_SIZE,
};
export const STATE_SIZE = OFFSET.field + 2 * BODY_SIZE * CELLS;
// [대기, 능력, 카드, 비용, x, y, x², y²]와 카드 특징이다.
export const ACTION_SIZE = 8 + CARD_SIZE;

// Python의 int()처럼 0 쪽으로 버린 뒤 격자 안으로 자른다.
const cell = (x: number, y: number) =>
  clamp(Math.trunc(y / (grid.height / grid.rows)), 0, grid.rows - 1) * grid.columns +
  clamp(Math.trunc(x / (grid.width / grid.columns)), 0, grid.columns - 1);

// 오브젝트의 특징을 칸에 더한다. 여러 오브젝트가 겹친 칸은 특징마다 1에서 멈춘다.
function place(vector: Float64Array, side: number, body: number[], x: number, y: number) {
  const start = OFFSET.field + side * BODY_SIZE * CELLS + cell(x, y);
  body.forEach((value, channel) => {
    const index = start + channel * CELLS;
    vector[index] = Math.min(1, vector[index]! + value);
  });
}

export function contextFeatures(context: DecisionContext) {
  const vector = new Float64Array(STATE_SIZE);
  vector.set([
    Math.min(1, (context.clock ?? 0) / FAST_POLICY.clockSeconds),
    Math.floor(context.elixir) / 10,
    context.enemyElixir.min / 10,
    context.enemyElixir.max / 10,
    context.skill === 'ready' ? 1 : 0,
  ]);
  if (context.towers) {
    vector[OFFSET.towersKnown] = 1;
    vector.set(context.towers.own, OFFSET.ownTowers);
    vector.set(context.towers.enemy, OFFSET.enemyTowers);
  }
  // 손패는 네 칸 카드 특징의 합을 4로 나눈 묶음이다.
  for (const card of context.hand.slice(0, 4)) {
    catalogueCard(card)?.features.forEach((value, index) => {
      vector[OFFSET.hand + index] = vector[OFFSET.hand + index]! + value / 4;
    });
  }
  const upcoming = (context.next ?? []).flatMap((card) => catalogueCard(card) ?? []);
  for (const card of upcoming)
    card.features.forEach((value, index) => {
      vector[OFFSET.next + index] = vector[OFFSET.next + index]! + value / upcoming.length;
    });
  [context.own, context.enemy].forEach((rows, side) => {
    for (const [kind, x, y] of rows) place(vector, side, bodyVector(kind), x, y);
  });
  for (const [side, card, x, y] of context.effects ?? [])
    if (isCatalogueBody(card)) place(vector, side === 'blue' ? 0 : 1, bodyVector(card), x, y);
  return vector;
}

const NO_CARD: number[] = Array.from({ length: CARD_SIZE }, () => 0);
// 대기는 카드가 없고, 능력은 영웅 카드의 특징을 갖지만 위치가 없다.
const actionVector = ([, kind, card, cost, x, y]: DecisionAction) => {
  const attributes = catalogueCard(card)?.features ?? NO_CARD;
  return Float64Array.from(
    match(kind)
      .with('card', () => [0, 0, 1, cost / 10, x / 18, y / 32, (x / 18) ** 2, (y / 32) ** 2, ...attributes])
      .with('ability', () => [0, 1, 0, cost / 10, 0, 0, 0, 0, ...attributes])
      .with('wait', () => [1, 0, 0, cost / 10, 0, 0, 0, 0, ...NO_CARD])
      .exhaustive(),
  );
};

export const actionFeatures = (context: DecisionContext) => context.actions.map(actionVector);

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
    if (!protection) return { ...result, towerProtection: undefined };
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
    return { ...result, logits, probabilities: exponents.map((value) => value / total), towerProtection };
  }
}
