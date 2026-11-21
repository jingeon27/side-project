import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { expect, it } from 'vitest';

import { SIMULATION_CANDIDATE_FILE, type TrophySnapshot } from './protocol.ts';
import { FakeLearner, loss, models, options, seal, useTrophyModels, win } from './session.fixture.ts';
import { TrophySession } from './session.ts';

useTrophyModels();

// 자가개선 감독이 넘기는 형식 그대로 control 폴더에 둔다.
async function offer(dataDir: string, model: TrophySnapshot) {
  const control = join(dataDir, 'trophy/learning/control');
  await mkdir(control, { recursive: true });
  await writeFile(
    join(control, SIMULATION_CANDIDATE_FILE),
    JSON.stringify({
      format: 'trophy-simulation-candidate-v1',
      policy: model.checkpoint,
      weightsSHA256: model.weightsSHA256,
      league: 'rules-test-fast4',
      version: 7,
      publishedAt: dayjs().toISOString(),
    }),
  );
}

// 평가 순서대로 두고, 후보 쪽만 이기거나 지게 한다. 탈락이 확정되면 남은 쌍 없이 끝난다.
async function playTrial(session: TrophySession, candidateWins: boolean) {
  while (session.status().phase === 'evaluating') {
    const plan = await session.nextMatch();
    expect(['baseline', 'candidate']).toContain(plan.role);
    await seal(plan, (plan.role === 'candidate') === candidateWins ? win : loss);
    await session.complete(plan);
  }
}

it('compares a handed-over simulator champion through the real gate and promotes it on a pass', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-simulation-pass-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    await offer(dataDir, models().candidate);
    const plan = await session.nextMatch();
    expect(plan.role).not.toBe('training');
    expect(learner.imports).toEqual([models().candidate.checkpoint]);
    await seal(plan, plan.role === 'candidate' ? win : loss);
    await session.complete(plan);
    await playTrial(session, true);
    expect(learner.calls).toBe(0);
    expect(session.status()).toMatchObject({
      promotions: 1,
      champion: models().candidate,
      candidate: models().candidate,
      simulation: { tried: [models().candidate.weightsSHA256], current: null, parked: null },
      lastEvaluation: { passed: true, candidateSource: { type: 'simulation', version: 7 } },
    });
    const report = JSON.parse(await readFile(String(session.status().lastEvaluation?.report), 'utf8'));
    expect(report.candidateSource).toMatchObject({ type: 'simulation', league: 'rules-test-fast4' });
    expect((await session.nextMatch()).role).toBe('training');
    expect(learner.imports).toHaveLength(1);
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('returns to the parked own-play candidate after a failed simulator trial and never retries it', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-simulation-fail-'));
  const learner = new FakeLearner();
  const first = await TrophySession.open(options(dataDir), learner);
  const before = first.status().candidate;
  await offer(dataDir, models().simulation);
  const opening = await first.nextMatch();
  expect(opening.role).not.toBe('training');
  await seal(opening, opening.role === 'candidate' ? loss : win);
  await first.complete(opening);
  await playTrial(first, false);
  expect(first.status()).toMatchObject({
    promotions: 0,
    champion: models().baseline,
    candidate: before,
    simulation: { tried: [models().simulation.weightsSHA256], current: null, parked: null },
    lastEvaluation: { passed: false, candidateSource: { type: 'simulation' } },
  });
  await first.close();
  const resumed = await TrophySession.open(options(dataDir), learner);
  try {
    expect((await resumed.nextMatch()).role).toBe('training');
    expect(learner.imports).toEqual([models().simulation.checkpoint]);
  } finally {
    await resumed.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it('ignores a handed-over policy with the champion weights', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'trophy-simulation-same-'));
  const learner = new FakeLearner();
  const session = await TrophySession.open(options(dataDir), learner);
  try {
    await offer(dataDir, models().baseline);
    expect((await session.nextMatch()).role).toBe('training');
    expect(learner.imports).toEqual([]);
  } finally {
    await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
