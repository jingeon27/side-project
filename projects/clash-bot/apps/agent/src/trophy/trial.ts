import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { FastPolicy } from '../core/fast/policy.ts';
import { atomicWrite } from '../shared/assets.ts';
import { readOptionalJsonFile } from '../shared/json-file.ts';
import {
  attemptAlpha,
  QUALIFICATION,
  realEvaluationGate,
  requiredEvaluationPairs,
} from '../shared/qualification.ts';
import { TrophyActor } from './actor.ts';
import { TROPHY_LEARNING, trophySnapshotSchema, type TrophySnapshot } from './protocol.ts';
import { verifiedTrophyEpisode } from './result.ts';
import { orderSchema, scoresOf, trialSchema, type Completed, type Trial } from './session-state.ts';

// 한 실험의 위치와 지금 비교하는 두 모델이다.
type Experiment = {
  control: string;
  root: string;
  behaviorSHA256: string;
  champion: TrophySnapshot;
  candidate: TrophySnapshot;
};

export const sealedDigest = async (directory: string) =>
  createHash('sha256')
    .update(await readFile(join(directory, 'trajectory.json')))
    .digest('hex');

// 학습 직전에 봉인한 자기 행동 경기를 원본에서 다시 확인한다.
export async function verifyTrainingBatch(batch: Completed[], experiment: Experiment) {
  for (const row of batch) {
    const episode = await verifiedTrophyEpisode(row.directory);
    if (
      (await sealedDigest(row.directory)) !== row.episodeSHA256 ||
      episode.id !== row.id ||
      episode.role !== 'training' ||
      !episode.learningEligible ||
      episode.behaviorSHA256 !== experiment.behaviorSHA256 ||
      JSON.stringify(episode.policy) !== JSON.stringify(experiment.candidate) ||
      JSON.stringify(episode.result) !== JSON.stringify(row.result)
    )
      throw new Error('봉인한 자기 행동 학습 기록이 바뀌었습니다.');
  }
}

// 평가를 시작하기 전에 판수·유의수준·역할 순서를 등록한다. 시도 횟수는 실험을 넘어 누적한다.
export async function registerTrial(experiment: Experiment): Promise<Trial> {
  const ledgerPath = join(experiment.control, 'evaluation-attempts.json');
  const ledger = (await readOptionalJsonFile(
    ledgerPath,
    z.strictObject({ count: z.int().nonnegative(), trials: z.record(z.string(), z.unknown()) }),
  )) ?? { count: 0, trials: {} };
  const alpha = attemptAlpha(ledger.count);
  const pairs = requiredEvaluationPairs(QUALIFICATION.minimumPairs, alpha);
  const id = randomUUID();
  const order = Array.from({ length: pairs }, () =>
    randomInt(2) ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const),
  );
  const trial = trialSchema.parse({
    id,
    attempt: ledger.count,
    alpha,
    pairs,
    order,
    baseline: experiment.champion,
    candidate: experiment.candidate,
    games: [],
  });
  await atomicWrite(
    ledgerPath,
    JSON.stringify(
      {
        count: ledger.count + 1,
        trials: {
          ...ledger.trials,
          [id]: {
            attempt: trial.attempt,
            behaviorSHA256: experiment.behaviorSHA256,
            root: experiment.root,
            baseline: trial.baseline,
            candidate: trial.candidate,
            alpha,
            pairs,
            order,
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
  return trial;
}

// 채택 전에 등록 내용, 역할 순서, 원본 화면·결과·확률과 가중치를 다시 확인한다.
export async function verifyTrial(trial: Trial, experiment: Experiment) {
  if (
    JSON.stringify(experiment.champion) !== JSON.stringify(trial.baseline) ||
    JSON.stringify(experiment.candidate) !== JSON.stringify(trial.candidate)
  )
    throw new Error('평가 모델이 도중에 바뀌었습니다.');
  if (
    new Set(trial.games.map((row) => row.id)).size !== trial.games.length ||
    new Set(trial.games.map((row) => row.directory)).size !== trial.games.length
  )
    throw new Error('중복 평가 경기입니다.');
  const registrations = z
    .object({ trials: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(await readFile(join(experiment.control, 'evaluation-attempts.json'), 'utf8')));
  const registered = z
    .object({
      attempt: z.number(),
      behaviorSHA256: z.string(),
      root: z.string(),
      baseline: trophySnapshotSchema,
      candidate: trophySnapshotSchema,
      alpha: z.number(),
      pairs: z.number(),
      order: z.array(orderSchema),
    })
    .parse(registrations.trials[trial.id]);
  if (
    registered.attempt !== trial.attempt ||
    registered.behaviorSHA256 !== experiment.behaviorSHA256 ||
    registered.root !== experiment.root ||
    registered.alpha !== trial.alpha ||
    registered.pairs !== trial.pairs ||
    JSON.stringify(registered.order) !== JSON.stringify(trial.order) ||
    JSON.stringify(registered.baseline) !== JSON.stringify(trial.baseline) ||
    JSON.stringify(registered.candidate) !== JSON.stringify(trial.candidate)
  )
    throw new Error('평가 사전 등록과 실제 평가가 다릅니다.');
  const actors = new Map<string, TrophyActor>();
  for (const snapshot of [trial.baseline, trial.candidate])
    actors.set(snapshot.weightsSHA256, new TrophyActor(await FastPolicy.load(snapshot.checkpoint), snapshot));
  for (const [index, row] of trial.games.entries()) {
    if (row.role !== trial.order[Math.floor(index / 2)]?.[index % 2])
      throw new Error('평가 역할 순서가 바뀌었습니다.');
    const expected = row.role === 'baseline' ? trial.baseline : trial.candidate;
    if (
      JSON.stringify(row.policy) !== JSON.stringify(expected) ||
      row.behaviorSHA256 !== experiment.behaviorSHA256
    )
      throw new Error('평가에 다른 모델·코드가 섞였습니다.');
    const episode = await verifiedTrophyEpisode(row.directory);
    if (
      (await sealedDigest(row.directory)) !== row.episodeSHA256 ||
      episode.learningEligible ||
      episode.id !== row.id ||
      episode.role !== row.role ||
      JSON.stringify(episode.result) !== JSON.stringify(row.result) ||
      JSON.stringify(episode.policy) !== JSON.stringify(expected) ||
      episode.sent !== episode.confirmed
    )
      throw new Error('원본 평가 기록이 바뀌었거나 학습 경기가 섞였습니다.');
    const actor = actors.get(expected.weightsSHA256);
    if (!actor) throw new Error('평가 모델이 없습니다.');
    for (const transition of episode.transitions) actor.verify(transition);
  }
  for (const snapshot of [trial.baseline, trial.candidate]) {
    const policy = await FastPolicy.load(snapshot.checkpoint);
    if (policy.sha256 !== snapshot.weightsSHA256) throw new Error('평가 가중치가 바뀌었습니다.');
  }
}

// 전체 표본이 모였는지, 남은 쌍을 모두 이겨도 통과할 수 없는지를 본다. 둘 다 아니면 평가는 계속된다.
export function trialProgress(trial: Trial) {
  const scores = scoresOf(trial);
  const complete = trial.games.length === trial.pairs * 2;
  const futile =
    trial.games.length % 2 === 0 &&
    scores.length > 0 &&
    !realEvaluationGate([...scores, ...Array<number>(trial.pairs - scores.length).fill(1)], trial.alpha)
      .passed;
  return { scores, complete, futile };
}

export function trialReport(trial: Trial, behaviorSHA256: string) {
  const { scores, complete, futile } = trialProgress(trial);
  const gate = realEvaluationGate(scores, trial.alpha);
  return {
    format: 'trophy-randomized-comparison-v1',
    ...trial,
    behaviorSHA256,
    complete,
    rejectedEarly: !complete && futile,
    trainingDuringEvaluation: false,
    sameEnvironmentSeed: false,
    selection: 'categorical_as_live',
    gate: {
      ...gate,
      passed: complete && gate.passed,
      reason: futile && !complete ? 'cannot_qualify_with_remaining_pairs' : gate.reason,
    },
  };
}

// 통과한 후보를 별도 포인터로 게시한다. 보고서의 SHA-256을 함께 남긴다.
export async function publishChampion(trial: Trial, experiment: Experiment, reportPath: string) {
  await atomicWrite(
    join(experiment.control, 'published.json'),
    JSON.stringify(
      {
        format: TROPHY_LEARNING.format,
        champion: trial.candidate,
        baseline: trial.baseline,
        behaviorSHA256: experiment.behaviorSHA256,
        report: reportPath,
        reportSHA256: createHash('sha256')
          .update(await readFile(reportPath))
          .digest('hex'),
      },
      null,
      2,
    ) + '\n',
  );
}
