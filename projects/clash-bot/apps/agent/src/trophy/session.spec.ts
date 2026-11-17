import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import type { TrophyResult } from './protocol.ts';
import {
  FakeLearner,
  loss,
  options,
  screenshot,
  seal,
  sha,
  useTrophyModels,
  win,
} from './session.fixture.ts';
import { TrophySession } from './session.ts';

useTrophyModels();

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
