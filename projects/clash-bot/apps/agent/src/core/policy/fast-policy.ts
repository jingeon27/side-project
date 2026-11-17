import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { clamp, minBy, range, sum, sumBy } from 'es-toolkit';
import { match } from 'ts-pattern';
import { z } from 'zod';

import {
  BODY_SIZE,
  bodyHealth,
  bodyVector,
  CARD_CATALOGUE,
  CARD_SIZE,
  catalogueCard,
  isCatalogueBody,
} from '../card-catalogue.ts';
import type { CombatBody } from './combat-projection.ts';
import type { DecisionAction, DecisionContext } from './decision-v3.ts';
import { towerDefense, type TowerDefenseInput } from './tower-defense.ts';

// 판단 문맥의 특징 배치다. Python(clash_bot.arena.fast_features)이 같은 계약으로 같은 숫자를 만든다.
// 카드와 필드 오브젝트는 이름 칸이 아니라 카드 카탈로그의 특징으로 들어가 덱이 바뀌어도 가중치 모양이 같다.
// 오브젝트는 본 체력·이동도 함께 들어가고, 후보 위치는 적·위협·타워와의 관계로 읽어 어느 칸이든 비교한다.
export const FAST_POLICY = z
  .strictObject({
    format: z.literal('clash-fast-policy-v4'),
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
// 칸마다 오브젝트 특징 뒤에 [체력 확인, 피해, x 이동, y 이동]을 둔다.
const CHANNELS = BODY_SIZE + 4;
const OFFSET = {
  towersKnown: 5,
  ownTowers: 6,
  enemyTowers: 9,
  hand: 12,
  next: 12 + CARD_SIZE,
  enemyOut: 12 + 2 * CARD_SIZE,
  field: 12 + 3 * CARD_SIZE,
};
export const STATE_SIZE = OFFSET.field + 2 * CHANNELS * CELLS;
const RELATIONS = 13;
// [대기, 능력, 카드, 비용, x, y, x², y², 진화]와 카드 특징, 위치 관계 13개다.
export const ACTION_SIZE = 9 + CARD_SIZE + RELATIONS;
const SPELL = CARD_CATALOGUE.cardFeatures.indexOf('spell');
const SPLASH = CARD_CATALOGUE.cardFeatures.indexOf('splash');
const HITPOINTS = CARD_CATALOGUE.bodyFeatures.indexOf('hitpoints');
const OWN_TOWERS = [
  [3.5, 6.5],
  [14.5, 6.5],
] as const;
const ENEMY_TOWERS = [
  [3.5, 25.5],
  [14.5, 25.5],
] as const;
// 이동은 초당 타일이며 3이면 빠른 유닛이다.
const SPEED = 3;

// Python의 int()처럼 0 쪽으로 버린 뒤 격자 안으로 자른다.
const cell = (x: number, y: number) =>
  clamp(Math.trunc(y / (grid.height / grid.rows)), 0, grid.rows - 1) * grid.columns +
  clamp(Math.trunc(x / (grid.width / grid.columns)), 0, grid.columns - 1);

// 칸에 더하기 전 오브젝트 하나의 [체력 확인, 피해, x 이동, y 이동]이다.
function seen(body: CombatBody) {
  const health = bodyHealth(body.kind, body.hp);
  const [vx, vy] = body.velocity ?? [0, 0];
  return [
    health === null ? 0 : 0.5,
    health === null ? 0 : 0.5 * (1 - health),
    (0.5 * vx) / SPEED,
    (0.5 * vy) / SPEED,
  ];
}

const addInto = (vector: Float64Array, start: number, values: readonly number[], scale = 1) =>
  values.forEach((value, index) => {
    vector[start + index] = vector[start + index]! + value * scale;
  });

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
    const entry = catalogueCard(card);
    if (entry) addInto(vector, OFFSET.hand, entry.features, 1 / 4);
  }
  const upcoming = (context.next ?? []).flatMap((card) => catalogueCard(card) ?? []);
  for (const card of upcoming) addInto(vector, OFFSET.next, card.features, 1 / upcoming.length);
  // 손에 없다고 아는 상대 카드다. 돌아오기까지 남은 사용 횟수로 무게를 준다.
  for (const [card, low] of context.enemyCycle ?? []) {
    const entry = catalogueCard(card);
    if (entry && low > 0) addInto(vector, OFFSET.enemyOut, entry.features, Math.min(low, 4) / 16);
  }
  // 칸마다 먼저 더한 뒤 한 번에 잘라 오브젝트 순서와 무관하게 한다.
  const field = new Float64Array(2 * CHANNELS * CELLS);
  const add = (side: number, index: number, values: readonly number[], first: number) =>
    values.forEach((value, channel) => {
      const at = (side * CHANNELS + first + channel) * CELLS + index;
      field[at] = field[at]! + value;
    });
  [context.bodies.own, context.bodies.enemy].forEach((bodies, side) => {
    for (const body of bodies) {
      const index = cell(body.x, body.y);
      add(side, index, bodyVector(body.kind), 0);
      add(side, index, seen(body), BODY_SIZE);
    }
  });
  for (const [side, card, x, y] of context.effects ?? [])
    if (isCatalogueBody(card)) add(side === 'blue' ? 0 : 1, cell(x, y), bodyVector(card), 0);
  field.forEach((value, at) => {
    const channel = Math.floor(at / CELLS) % CHANNELS;
    vector[OFFSET.field + at] = clamp(value, channel >= BODY_SIZE + 2 ? -1 : 0, 1);
  });
  return vector;
}

const distance = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const NO_RELATIONS: number[] = Array.from({ length: RELATIONS }, () => 0);

// 카드 배치 하나의 위치 관계다. 대기와 능력은 0이다. Python relations()와 같은 순서다.
function relations(context: DecisionContext, [, kind, card, , x, y]: DecisionAction) {
  if (kind !== 'card') return NO_RELATIONS;
  const place = [x, y] as const;
  const result = [...NO_RELATIONS];
  const enemies = context.bodies.enemy;
  // With no enemy or no threat the distance reads as far (1).
  result[0] = 1;
  result[3] = 1;
  if (enemies.length > 0) {
    const distances = enemies.map((body) => distance([body.x, body.y], place));
    const nearest = distances.indexOf(Math.min(...distances));
    result[0] = Math.min(1, distances[nearest]! / 10);
    result[1] = clamp((enemies[nearest]!.x - x) / 10, -1, 1);
    result[2] = clamp((enemies[nearest]!.y - y) / 10, -1, 1);
    const entry = catalogueCard(card);
    const reach = entry && entry.features[SPELL] === 1 ? entry.features[SPLASH]! * 4 : 2.5;
    const inside = enemies.filter((_, index) => distances[index]! <= reach);
    result[5] = Math.min(1, inside.length / 4);
    result[6] = Math.min(1, sumBy(inside, (body) => bodyVector(body.kind)[HITPOINTS]!) / 2);
  }
  // 위협은 후보 규칙처럼 우리 진영에서 가장 깊이 들어온 적이다.
  const threat = minBy(
    enemies.filter((body) => body.y < 16),
    (body) => body.y,
  );
  if (threat) {
    result[3] = Math.min(1, distance([threat.x, threat.y], place) / 10);
    result[4] = clamp((threat.y - y) / 10, -1, 1);
  }
  result[7] = Math.min(
    1,
    context.bodies.own.filter((body) => distance([body.x, body.y], place) <= 3).length / 3,
  );
  result[8] = Math.min(1, Math.min(...OWN_TOWERS.map((tower) => distance(tower, place))) / 10);
  result[9] = Math.min(1, Math.min(...ENEMY_TOWERS.map((tower) => distance(tower, place))) / 16);
  result[10] = x < 8 ? 1 : 0;
  result[11] = x > 10 ? 1 : 0;
  result[12] = y > 16 ? 1 : 0;
  return result;
}

// 다음 사용이 진화면 1, 그럴 수 있으면 0.5다.
function evolved(context: DecisionContext, card: string | null) {
  const row = context.ownEvolution?.find(([name]) => name === card);
  if (!row) return 0;
  return row[2] === 0 ? 1 : row[1] === 0 ? 0.5 : 0;
}

const NO_CARD: number[] = Array.from({ length: CARD_SIZE }, () => 0);
// 대기는 카드가 없고, 능력은 영웅 카드의 특징을 갖지만 위치가 없다.
const actionVector = (context: DecisionContext, action: DecisionAction) => {
  const [, kind, card, cost, x, y] = action;
  const attributes = catalogueCard(card)?.features ?? NO_CARD;
  return Float64Array.from([
    ...match(kind)
      .with('card', () => [
        0,
        0,
        1,
        cost / 10,
        x / 18,
        y / 32,
        (x / 18) ** 2,
        (y / 32) ** 2,
        evolved(context, card),
        ...attributes,
      ])
      .with('ability', () => [0, 1, 0, cost / 10, 0, 0, 0, 0, 0, ...attributes])
      .with('wait', () => [1, 0, 0, cost / 10, 0, 0, 0, 0, 0, ...NO_CARD])
      .exhaustive(),
    ...relations(context, action),
  ]);
};

export const actionFeatures = (context: DecisionContext) =>
  context.actions.map((action) => actionVector(context, action));

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
