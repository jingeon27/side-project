import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { CARD_CATALOGUE } from '../core/card-catalogue.ts';
import {
  ACTION_SIZE,
  FAST_POLICY,
  STATE_SIZE,
  weightsChecksum,
  type FastWeights,
} from '../core/policy/fast-policy.ts';
import type { TrophyLearnerPort } from './learner-client.ts';
import { TROPHY_LEARNING, type TrophyPlan, type TrophyResult, type TrophySnapshot } from './protocol.ts';
import { TrophySession } from './session.ts';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const fixtures = {
  root: '',
  baseline: null as TrophySnapshot | null,
  candidate: null as TrophySnapshot | null,
};
beforeAll(async () => {
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
});
afterAll(async () => rm(fixtures.root, { recursive: true, force: true }));

class FakeLearner implements TrophyLearnerPort {
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
async function screenshot(result: TrophyResult) {
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
async function seal(plan: TrophyPlan, result: TrophyResult, overrides: Record<string, unknown> = {}) {
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
const options = (dataDir: string) => ({
  dataDir,
  seedPolicy: fixtures.baseline?.checkpoint ?? '',
  behaviorIdentity: async () => 'a'.repeat(64),
});
const loss = { blue: 0, red: 3, outcome: 'loss' } as const,
  win = { blue: 3, red: 0, outcome: 'win' } as const;

it('learns only new verified own games and publishes only after all held-out pairs pass', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-qualification-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    for (const result of [loss, loss]) {
      const plan = await session.nextMatch();
      await seal(plan, result);
      await session.complete(plan);
    }
    expect(learner.calls).toBe(1);
    expect(session.status()).toMatchObject({
      updates: 1,
      trainingGames: 2,
      promotions: 0,
      phase: 'evaluating',
    });
    const pairs = session.status().trial?.pairs;
    if (!pairs) throw new Error('No frozen evaluation');
    for (const index of Array.from({ length: pairs * 2 }, (_, i) => i)) {
      const plan = await session.nextMatch();
      expect(['baseline', 'candidate']).toContain(plan.role);
      await seal(plan, plan.role === 'candidate' ? win : loss);
      await session.complete(plan);
      if (index < pairs * 2 - 1) expect(session.status().champion.version).toBe(0);
    }
    expect(learner.calls).toBe(1);
    expect(session.status()).toMatchObject({ promotions: 1, champion: { version: 1 }, phase: 'training' });
    const pointer = JSON.parse(
      await readFile(join(dataDir, 'trophy/learning/control/published.json'), 'utf8'),
    );
    expect(pointer.reportSHA256).toBe(sha(await readFile(pointer.report)));
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('recovers a sealed game once and never trains a read-only or unconfirmed game', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-resume-'));
  const learner = new FakeLearner();
  const first = await TrophySession.open(options(dataDir), learner);
  const plan = await first.nextMatch();
  await seal(plan, loss, { learningEligible: false, sent: 1, confirmed: 0 });
  await first.complete(plan);
  expect(first.status()).toMatchObject({ excluded: 1, trainingGames: 0, updates: 0 });
  const valid = await first.nextMatch();
  await seal(valid, loss);
  await first.complete(valid);
  const sealed = await first.nextMatch();
  await seal(sealed, loss);
  await first.close();
  const resumed = await TrophySession.open(options(dataDir), learner);
  try {
    expect(learner.calls).toBe(1);
    expect(resumed.status()).toMatchObject({ trainingGames: 2, updates: 1, phase: 'evaluating' });
    await resumed.complete(sealed);
    expect(learner.calls).toBe(1);
    const evalPlan = await resumed.nextMatch();
    await seal(evalPlan, win, { learningEligible: true });
    await expect(resumed.complete(evalPlan)).rejects.toThrow();
  } finally {
    await resumed.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('rejects changed result evidence and refuses to adopt a tampered evaluation', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-tamper-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    for (const result of [loss, loss]) {
      const plan = await session.nextMatch();
      await seal(plan, result);
      await session.complete(plan);
    }
    const first = await session.nextMatch();
    await seal(first, first.role === 'candidate' ? win : loss);
    await session.complete(first);
    await writeFile(
      join(first.directory, 'result-1.png'),
      await screenshot(first.role === 'candidate' ? loss : win),
    );
    const pairs = session.status().trial?.pairs;
    if (!pairs) throw new Error('No frozen evaluation');
    for (const index of Array.from({ length: pairs * 2 - 2 }, (_, i) => i)) {
      const plan = await session.nextMatch();
      await seal(plan, plan.role === 'candidate' ? win : loss);
      await session.complete(plan);
      expect(session.status().evaluationGames).toBe(index + 2);
    }
    const final = await session.nextMatch();
    await seal(final, final.role === 'candidate' ? win : loss);
    await expect(session.complete(final)).rejects.toThrow('증거');
    expect(session.status().promotions).toBe(0);
    await expect(
      readFile(join(dataDir, 'trophy/learning/control/published.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('rechecks sealed own games immediately before learning', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-own-evidence-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    const first = await session.nextMatch();
    await seal(first, loss);
    await session.complete(first);
    await writeFile(join(first.directory, '0001.png'), await screenshot(win));
    const second = await session.nextMatch();
    await seal(second, loss);
    await expect(session.complete(second)).rejects.toThrow('화면 증거');
    expect(learner.calls).toBe(0);
    expect(session.status().updates).toBe(0);
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('rejects futile candidates early, resumes training and preserves the champion', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-futility-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    for (const result of [loss, loss]) {
      const plan = await session.nextMatch();
      await seal(plan, result);
      await session.complete(plan);
    }
    const pairs = session.status().trial?.pairs;
    if (!pairs) throw new Error('No frozen evaluation');
    for (const result of Array<TrophyResult>(pairs * 2).fill(loss)) {
      const plan = await session.nextMatch();
      await seal(plan, result);
      await session.complete(plan);
      if (!session.status().trial) break;
    }
    expect(session.status()).toMatchObject({
      promotions: 0,
      champion: { version: 0 },
      candidate: { version: 1 },
      phase: 'training',
      lastEvaluation: { passed: false },
    });
    expect(session.status().evaluationGames).toBeLessThan(pairs * 2);
    expect(learner.calls).toBe(1);
    expect((await session.nextMatch()).role).toBe('training');
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
