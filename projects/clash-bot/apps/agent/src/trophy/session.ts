import { createHash, randomInt, randomUUID } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';
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
import { acquireLearningLock } from '../shared/runtime-lock.ts';
import { TrophyActor } from './actor.ts';
import { TrophyLearnerClient, type TrophyLearnerPort } from './learner-client.ts';
import {
  TROPHY_LEARNING,
  trophyPlanSchema,
  trophyResultSchema,
  trophySnapshotSchema,
  type TrophyPlan,
} from './protocol.ts';
import { verifiedTrophyEpisode } from './result.ts';

const completedSchema = trophyPlanSchema.extend({
  result: trophyResultSchema,
  episodeSHA256: z.string().length(64),
});
type Completed = z.infer<typeof completedSchema>;
const orderSchema = z
  .tuple([z.enum(['baseline', 'candidate']), z.enum(['baseline', 'candidate'])])
  .refine((row) => row[0] !== row[1]);
const trialSchema = z.strictObject({
  id: z.uuid(),
  alpha: z.number().positive(),
  attempt: z.int().nonnegative(),
  pairs: z.int().positive(),
  order: z.array(orderSchema),
  baseline: trophySnapshotSchema,
  candidate: trophySnapshotSchema,
  games: z.array(completedSchema),
});
const stateSchema = z.strictObject({
  format: z.literal('trophy-own-policy-learning-v1'),
  behaviorSHA256: z.string().length(64),
  champion: trophySnapshotSchema,
  candidate: trophySnapshotSchema,
  phase: z.enum(['training', 'learning', 'evaluating']),
  pending: trophyPlanSchema.nullable(),
  batch: z.array(completedSchema),
  trial: trialSchema.nullable(),
  processed: z.array(z.string()),
  trainingGames: z.int().nonnegative(),
  evaluationGames: z.int().nonnegative(),
  updates: z.int().nonnegative(),
  promotions: z.int().nonnegative(),
  excluded: z.int().nonnegative(),
  consecutiveExcluded: z.int().nonnegative(),
  lastUpdate: z.record(z.string(), z.unknown()).nullable(),
  lastEvaluation: z.record(z.string(), z.unknown()).nullable(),
});
type State = z.infer<typeof stateSchema>;
type Options = { dataDir: string; seedPolicy: string; behaviorIdentity: () => Promise<string> };

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};
const scoresOf = (trial: z.infer<typeof trialSchema>) =>
  Array.from({ length: Math.floor(trial.games.length / 2) }, (_, i) => {
    const pair = trial.games.slice(i * 2, i * 2 + 2);
    const candidate = pair.find((row) => row.role === 'candidate'),
      baseline = pair.find((row) => row.role === 'baseline');
    if (!candidate || !baseline) throw new Error('평가 쌍의 역할이 다릅니다.');
    return 0.5 + (Number(candidate.result.outcome === 'win') - Number(baseline.result.outcome === 'win')) / 2;
  });

// This owns the durable learning/evaluation/promotion state, not ADB or the UI.
// The local screen adapter calls nextMatch/actor/complete; tests use sealed evidence.
export class TrophySession {
  readonly options: Options;
  readonly root: string;
  readonly control: string;
  readonly learner: TrophyLearnerPort;
  readonly state: State;
  readonly lock: Awaited<ReturnType<typeof acquireLearningLock>>;
  readonly startedAt = dayjs().toISOString();
  private constructor(
    options: Options,
    root: string,
    learner: TrophyLearnerPort,
    state: State,
    lock: Awaited<ReturnType<typeof acquireLearningLock>>,
  ) {
    this.options = options;
    this.root = root;
    this.control = join(options.dataDir, 'trophy/learning/control');
    this.learner = learner;
    this.state = state;
    this.lock = lock;
  }

  static async open(options: Options, port?: TrophyLearnerPort) {
    const control = join(options.dataDir, 'trophy/learning/control');
    const behaviorSHA256 = await options.behaviorIdentity();
    const root = join(options.dataDir, 'trophy/learning/experiments', behaviorSHA256);
    const lock = await acquireLearningLock(control);
    const learner = port ?? new TrophyLearnerClient(options.dataDir, root);
    try {
      await mkdir(root, { recursive: true });
      const stored = await readOptionalJsonFile(join(root, 'state.json'), stateSchema);
      const seed = stored ? stored.champion : await learner.initialize(options.seedPolicy, behaviorSHA256);
      const state: State = stored ?? {
        format: TROPHY_LEARNING.format,
        behaviorSHA256,
        champion: seed,
        candidate: seed,
        phase: 'training',
        pending: null,
        batch: [],
        trial: null,
        processed: [],
        trainingGames: 0,
        evaluationGames: 0,
        updates: 0,
        promotions: 0,
        excluded: 0,
        consecutiveExcluded: 0,
        lastUpdate: null,
        lastEvaluation: null,
      };
      if (state.behaviorSHA256 !== behaviorSHA256)
        throw new Error('트로피 실행 코드와 저장된 실험이 다릅니다.');
      const session = new TrophySession(options, root, learner, state, lock);
      await atomicWrite(join(control, 'active.json'), JSON.stringify({ root, behaviorSHA256 }) + '\n');
      await session.save();
      await session.recoverPending();
      if (state.phase === 'learning') await session.learn();
      if (state.phase === 'evaluating') await session.finishEvaluation();
      return session;
    } catch (error) {
      await learner.close();
      await lock.release();
      throw error;
    }
  }

  private async assertBehavior() {
    if ((await this.options.behaviorIdentity()) !== this.state.behaviorSHA256)
      throw new Error('트로피 실행 코드가 바뀌어 현재 경기·평가를 섞을 수 없습니다.');
  }
  private async recoverPending() {
    const pending = this.state.pending;
    if (!pending) return;
    if (await exists(join(pending.directory, 'trajectory.json'))) {
      await this.complete(pending);
      return;
    }
    this.state.excluded++;
    this.state.pending = null;
    await this.save();
  }
  private async save() {
    stateSchema.parse(this.state);
    await atomicWrite(join(this.root, 'state.json'), JSON.stringify(this.state, null, 2) + '\n');
    await atomicWrite(join(this.control, 'status.json'), JSON.stringify(this.status(), null, 2) + '\n');
  }
  status() {
    return {
      ...this.lock.owner,
      startedAt: this.startedAt,
      format: TROPHY_LEARNING.format,
      phase: this.state.phase,
      updatedAt: dayjs().toISOString(),
      root: this.root,
      behaviorSHA256: this.state.behaviorSHA256,
      champion: this.state.champion,
      candidate: this.state.candidate,
      trainingGames: this.state.trainingGames,
      evaluationGames: this.state.evaluationGames,
      updates: this.state.updates,
      promotions: this.state.promotions,
      excluded: this.state.excluded,
      batch: this.state.batch.length,
      pending: this.state.pending,
      trial: this.state.trial,
      lastUpdate: this.state.lastUpdate,
      lastEvaluation: this.state.lastEvaluation,
    };
  }

  async nextMatch(): Promise<TrophyPlan> {
    await this.assertBehavior();
    if (this.state.pending) throw new Error('이전 경기가 끝나기 전에 새 경기를 시작할 수 없습니다.');
    if (this.state.consecutiveExcluded >= 3) throw new Error('입력·결과 검증이 3경기 연속 실패했습니다.');
    if (this.state.phase === 'learning') await this.learn();
    const trial = this.state.trial;
    const role = trial
      ? trial.order[Math.floor(trial.games.length / 2)]?.[trial.games.length % 2]
      : 'training';
    if (!role) throw new Error('평가 순서가 범위를 벗어났습니다.');
    const policy = role === 'baseline' ? this.state.champion : this.state.candidate;
    const id = randomUUID();
    const directory = join(this.root, 'runs', id);
    await mkdir(directory, { recursive: true });
    const plan = trophyPlanSchema.parse({
      id,
      role,
      directory,
      policy,
      behaviorSHA256: this.state.behaviorSHA256,
    });
    await atomicWrite(join(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
    this.state.pending = plan;
    await this.save();
    return plan;
  }

  async actor(plan: TrophyPlan) {
    if (plan.id !== this.state.pending?.id) throw new Error('현재 경기 계획과 모델이 다릅니다.');
    return new TrophyActor(await FastPolicy.load(plan.policy.checkpoint), plan.policy);
  }

  async complete(plan: TrophyPlan) {
    await this.assertBehavior();
    const episode = await verifiedTrophyEpisode(plan.directory);
    if (
      episode.id !== plan.id ||
      episode.role !== plan.role ||
      episode.behaviorSHA256 !== plan.behaviorSHA256 ||
      JSON.stringify(episode.policy) !== JSON.stringify(plan.policy)
    )
      throw new Error('실제 경기와 학습 계획이 다릅니다.');
    if (this.state.processed.includes(plan.id)) return this.status();
    if (plan.id !== this.state.pending?.id) throw new Error('현재 수집 중인 경기가 아닙니다.');
    const digest = createHash('sha256')
      .update(await readFile(join(plan.directory, 'trajectory.json')))
      .digest('hex');
    const row: Completed = { ...plan, result: episode.result, episodeSHA256: digest };
    this.state.processed.push(plan.id);
    this.state.pending = null;
    const valid =
      episode.sent === episode.confirmed && episode.transitions.length >= TROPHY_LEARNING.minimumTransitions;
    if (!valid) {
      this.state.excluded++;
      this.state.consecutiveExcluded++;
      await this.save();
      return this.status();
    }
    this.state.consecutiveExcluded = 0;
    if (plan.role === 'training') {
      if (!episode.learningEligible) throw new Error('학습 역할 경기가 학습 가능 기록이 아닙니다.');
      this.state.batch.push(row);
      await this.save();
      if (this.state.batch.length >= TROPHY_LEARNING.trainingMatches) {
        this.state.phase = 'learning';
        await this.save();
        await this.learn();
      }
      return this.status();
    }
    if (!this.state.trial || !['baseline', 'candidate'].includes(plan.role) || episode.learningEligible)
      throw new Error('평가 경기를 학습으로 바꾸거나 잘못된 평가를 기록할 수 없습니다.');
    this.state.trial.games.push(row);
    this.state.evaluationGames++;
    await this.save();
    await this.finishEvaluation();
    return this.status();
  }

  private async learn() {
    await this.assertBehavior();
    if (!this.state.batch.length) throw new Error('학습할 새 자기 행동 경기가 없습니다.');
    const batch = this.state.batch;
    for (const row of batch) {
      const episode = await verifiedTrophyEpisode(row.directory);
      const actual = createHash('sha256')
        .update(await readFile(join(row.directory, 'trajectory.json')))
        .digest('hex');
      if (
        actual !== row.episodeSHA256 ||
        episode.id !== row.id ||
        episode.role !== 'training' ||
        !episode.learningEligible ||
        episode.behaviorSHA256 !== this.state.behaviorSHA256 ||
        JSON.stringify(episode.policy) !== JSON.stringify(this.state.candidate) ||
        JSON.stringify(episode.result) !== JSON.stringify(row.result)
      )
        throw new Error('봉인한 자기 행동 학습 기록이 바뀌었습니다.');
    }
    const update = await this.learner.train(
      this.state.candidate,
      batch.map((row) => join(row.directory, 'trajectory.json')),
      this.state.behaviorSHA256,
      this.state.champion.weightsSHA256,
    );
    this.state.lastUpdate = update;
    this.state.trainingGames += batch.length;
    this.state.batch = [];
    this.state.candidate = update.snapshot;
    if (!update.report.updated) {
      this.state.phase = 'training';
      await this.save();
      return;
    }
    this.state.updates++;
    const ledgerPath = join(this.control, 'evaluation-attempts.json');
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
      baseline: this.state.champion,
      candidate: this.state.candidate,
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
              behaviorSHA256: this.state.behaviorSHA256,
              root: this.root,
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
    this.state.trial = trial;
    this.state.phase = 'evaluating';
    await this.save();
  }

  private async verifyEvaluation(trial: z.infer<typeof trialSchema>) {
    await this.assertBehavior();
    if (
      JSON.stringify(this.state.champion) !== JSON.stringify(trial.baseline) ||
      JSON.stringify(this.state.candidate) !== JSON.stringify(trial.candidate)
    )
      throw new Error('평가 모델이 도중에 바뀌었습니다.');
    if (
      new Set(trial.games.map((row) => row.id)).size !== trial.games.length ||
      new Set(trial.games.map((row) => row.directory)).size !== trial.games.length
    )
      throw new Error('중복 평가 경기입니다.');
    const registrations = z
      .object({ trials: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(await readFile(join(this.control, 'evaluation-attempts.json'), 'utf8')));
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
      registered.behaviorSHA256 !== this.state.behaviorSHA256 ||
      registered.root !== this.root ||
      registered.alpha !== trial.alpha ||
      registered.pairs !== trial.pairs ||
      JSON.stringify(registered.order) !== JSON.stringify(trial.order) ||
      JSON.stringify(registered.baseline) !== JSON.stringify(trial.baseline) ||
      JSON.stringify(registered.candidate) !== JSON.stringify(trial.candidate)
    )
      throw new Error('평가 사전 등록과 실제 평가가 다릅니다.');
    const actors = new Map<string, TrophyActor>();
    for (const snapshot of [trial.baseline, trial.candidate])
      actors.set(
        snapshot.weightsSHA256,
        new TrophyActor(await FastPolicy.load(snapshot.checkpoint), snapshot),
      );
    for (const [index, row] of trial.games.entries()) {
      if (row.role !== trial.order[Math.floor(index / 2)]?.[index % 2])
        throw new Error('평가 역할 순서가 바뀌었습니다.');
      const expected = row.role === 'baseline' ? trial.baseline : trial.candidate;
      if (
        JSON.stringify(row.policy) !== JSON.stringify(expected) ||
        row.behaviorSHA256 !== this.state.behaviorSHA256
      )
        throw new Error('평가에 다른 모델·코드가 섞였습니다.');
      const episode = await verifiedTrophyEpisode(row.directory);
      const actual = createHash('sha256')
        .update(await readFile(join(row.directory, 'trajectory.json')))
        .digest('hex');
      if (
        actual !== row.episodeSHA256 ||
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

  private async finishEvaluation() {
    const trial = this.state.trial;
    if (!trial) return;
    const scores = scoresOf(trial);
    const complete = trial.games.length === trial.pairs * 2;
    const futile =
      trial.games.length % 2 === 0 &&
      scores.length > 0 &&
      !realEvaluationGate([...scores, ...Array<number>(trial.pairs - scores.length).fill(1)], trial.alpha)
        .passed;
    if (!complete && !futile) return;
    await this.verifyEvaluation(trial);
    const gate = realEvaluationGate(scores, trial.alpha);
    const passed = complete && gate.passed;
    const report = {
      format: 'trophy-randomized-comparison-v1',
      ...trial,
      behaviorSHA256: this.state.behaviorSHA256,
      complete,
      rejectedEarly: !complete && futile,
      trainingDuringEvaluation: false,
      sameEnvironmentSeed: false,
      selection: 'categorical_as_live',
      gate: {
        ...gate,
        passed,
        reason: futile && !complete ? 'cannot_qualify_with_remaining_pairs' : gate.reason,
      },
    };
    const reportPath = join(this.root, 'evaluations', trial.id + '.json');
    await atomicWrite(reportPath, JSON.stringify(report, null, 2) + '\n');
    if (passed) {
      await atomicWrite(
        join(this.control, 'published.json'),
        JSON.stringify(
          {
            format: TROPHY_LEARNING.format,
            champion: trial.candidate,
            baseline: trial.baseline,
            behaviorSHA256: this.state.behaviorSHA256,
            report: reportPath,
            reportSHA256: createHash('sha256')
              .update(await readFile(reportPath))
              .digest('hex'),
          },
          null,
          2,
        ) + '\n',
      );
      this.state.champion = trial.candidate;
      this.state.promotions++;
    }
    this.state.lastEvaluation = { report: reportPath, passed, gate: report.gate };
    this.state.trial = null;
    this.state.phase = 'training';
    await this.save();
  }

  async close() {
    try {
      await this.learner.close();
      await atomicWrite(
        join(this.control, 'status.json'),
        JSON.stringify({ ...this.status(), phase: 'stopped' }) + '\n',
      );
    } finally {
      await this.lock.release();
    }
  }
}
