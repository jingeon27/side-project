import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll } from 'vitest';

import { CARD_CATALOGUE } from '../core/card-catalogue.ts';
import { ACTION_SIZE, FAST_POLICY, STATE_SIZE } from '../core/fast/features.ts';
import { weightsChecksum, type FastWeights } from '../core/fast/policy.ts';
import type { TrophyLearnerPort } from './learner-client.ts';
import { TROPHY_LEARNING, type TrophyPlan, type TrophyResult, type TrophySnapshot } from './protocol.ts';

export const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const fixtures = {
  root: '',
  baseline: null as TrophySnapshot | null,
  candidate: null as TrophySnapshot | null,
};
// 검사 파일이 맨 위에서 한 번 부른다. 기준·후보 두 정책 파일을 임시 폴더에 만들고 끝나면 지운다.
export function useTrophyModels() {
  beforeAll(prepareModels);
  afterAll(async () => rm(fixtures.root, { recursive: true, force: true }));
}
async function prepareModels() {
  fixtures.root = await mkdtemp(join(tmpdir(), 'trophy-models-'));
  const shapes = {
    'encoder.weight': [FAST_POLICY.hidden, STATE_SIZE],
    'encoder.bias': [FAST_POLICY.hidden],
    'query.weight': [FAST_POLICY.attention, FAST_POLICY.hidden],
    'query.bias': [FAST_POLICY.attention],
    'action.weight': [FAST_POLICY.attention, ACTION_SIZE],
    'action.bias': [FAST_POLICY.attention],
    'value.weight': [1, FAST_POLICY.hidden],
    'value.bias': [1],
  } satisfies Record<keyof FastWeights, number[]>;
  const save = async (version: number) => {
    const weights = Object.fromEntries(
      Object.entries(shapes).map(([key, shape]) => [
        key,
        new Float64Array(shape.reduce((a, b) => a * b, 1)).fill(key === 'value.bias' ? version * 0.1 : 0),
      ]),
    ) as FastWeights;
    const weightsSHA256 = weightsChecksum(weights),
      checkpoint = join(fixtures.root, `v${version}.json`);
    await writeFile(
      checkpoint,
      JSON.stringify({
        format: FAST_POLICY.format,
        catalogue: CARD_CATALOGUE.id,
        stateSize: STATE_SIZE,
        actionSize: ACTION_SIZE,
        version,
        weightsSHA256,
        weights: Object.fromEntries(
          Object.entries(shapes).map(([key, shape]) => [
            key,
            { shape, values: Array.from(weights[key as keyof FastWeights]) },
          ]),
        ),
      }),
    );
    return { checkpoint, version, weightsSHA256 };
  };
  fixtures.baseline = await save(0);
  fixtures.candidate = await save(1);
}

export class FakeLearner implements TrophyLearnerPort {
  calls = 0;
  async initialize() {
    if (!fixtures.baseline) throw new Error('Fixture missing');
    return fixtures.baseline;
  }
  async train() {
    this.calls++;
    if (!fixtures.candidate) throw new Error('Fixture missing');
    return { snapshot: fixtures.candidate, report: { updated: true }, id: 'test-update' };
  }
  async close() {}
}
// 왕관 수가 보이는 결과 화면 한 장이다.
export async function screenshot(result: TrophyResult) {
  const data = Buffer.alloc(368 * 652 * 3);
  const fill = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
    for (const row of Array.from({ length: h }, (_, i) => y + i))
      for (const col of Array.from({ length: w }, (_, i) => x + i)) {
        const at = (row * 368 + col) * 3;
        data[at] = r;
        data[at + 1] = g;
        data[at + 2] = b;
      }
  };
  fill(200, 575, 80, 35, 30, 160, 230);
  fill(50, 180, 260, 20, 180, 40, 90);
  fill(50, 330, 260, 20, 30, 120, 200);
  for (const [count, y] of [
    [result.red, 100],
    [result.blue, 250],
  ] as const)
    for (const x of [65, 164, 263].slice(0, count)) fill(x, y, 45, 65, 230, 180, 40);
  return sharp(data, { raw: { width: 368, height: 652, channels: 3 } })
    .png()
    .toBuffer();
}
// 계획대로 둔 한 경기의 화면·결과·궤적을 계획 폴더에 봉인한다.
export async function seal(plan: TrophyPlan, result: TrophyResult, overrides: Record<string, unknown> = {}) {
  const image = await screenshot(result);
  const hash = sha(image);
  for (const name of ['0001.png', 'result-1.png', 'result-2.png'])
    await writeFile(join(plan.directory, name), image);
  const transition = {
    at: 1000,
    image: '0001.png',
    imageSHA256: hash,
    features: { index: [1], value: [0.5] },
    actionFeatures: [Array(ACTION_SIZE).fill(0), Array(ACTION_SIZE).fill(0)],
    bias: [0, 0],
    temperature: 1,
    exploration: 0.01,
    probabilities: [0.5, 0.5],
    chosen: 0,
    value: Math.tanh(plan.policy.version * 0.1),
    confirmation: 'verified_wait',
  };
  await writeFile(
    join(plan.directory, 'trajectory.json'),
    JSON.stringify({
      format: 'trophy-own-trajectory-v1',
      id: plan.id,
      role: plan.role,
      behaviorSHA256: plan.behaviorSHA256,
      policy: plan.policy,
      result,
      resultEvidence: [
        { image: 'result-1.png', sha256: hash, at: 2000 },
        { image: 'result-2.png', sha256: hash, at: 2500 },
      ],
      transitions: Array.from({ length: TROPHY_LEARNING.minimumTransitions }, (_, i) => ({
        ...transition,
        at: 1000 + i * 100,
      })),
      sent: 0,
      confirmed: 0,
      learningEligible: plan.role === 'training',
      ...overrides,
    }),
  );
}
export const options = (dataDir: string) => ({
  dataDir,
  seedPolicy: fixtures.baseline?.checkpoint ?? '',
  behaviorIdentity: async () => 'a'.repeat(64),
});
export const loss = { blue: 0, red: 3, outcome: 'loss' } as const,
  win = { blue: 3, red: 0, outcome: 'win' } as const;
