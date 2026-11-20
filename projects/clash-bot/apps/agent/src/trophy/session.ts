import { randomUUID } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';

import { FastPolicy } from '../core/fast/policy.ts';
import { atomicWrite } from '../shared/assets.ts';
import { readOptionalJsonFile } from '../shared/json-file.ts';
import { acquireLearningLock } from '../shared/runtime-lock.ts';
import { TrophyActor } from './actor.ts';
import { TrophyLearnerClient, type TrophyLearnerPort } from './learner-client.ts';
import { TROPHY_LEARNING, trophyControl, trophyPlanSchema, type TrophyPlan } from './protocol.ts';
import { verifiedTrophyEpisode } from './result.ts';
import { initialState, stateSchema, type Completed, type State } from './session-state.ts';
import { adoptSimulationOffer, candidateSource, settleSimulationTrial } from './simulation.ts';
import {
  publishChampion,
  registerTrial,
  sealedDigest,
  trialProgress,
  trialReport,
  verifyTrainingBatch,
  verifyTrial,
} from './trial.ts';

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
    this.control = trophyControl(options.dataDir);
    this.learner = learner;
    this.state = state;
    this.lock = lock;
  }

  static async open(options: Options, port?: TrophyLearnerPort) {
    const control = trophyControl(options.dataDir);
    const behaviorSHA256 = await options.behaviorIdentity();
    const root = join(options.dataDir, 'trophy/learning/experiments', behaviorSHA256);
    const lock = await acquireLearningLock(control);
    const learner = port ?? new TrophyLearnerClient(options.dataDir, root);
    try {
      await mkdir(root, { recursive: true });
      const stored = await readOptionalJsonFile(join(root, 'state.json'), stateSchema);
      const seed = stored ? stored.champion : await learner.initialize(options.seedPolicy, behaviorSHA256);
      const state: State = stored ?? initialState(behaviorSHA256, seed);
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

  // 지금 비교하는 두 모델과 이 실험의 위치다. 상태가 바뀐 뒤에는 다시 읽는다.
  private experiment() {
    return {
      control: this.control,
      root: this.root,
      behaviorSHA256: this.state.behaviorSHA256,
      champion: this.state.champion,
      candidate: this.state.candidate,
    };
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
      simulation: this.state.simulation,
    };
  }

  async nextMatch(): Promise<TrophyPlan> {
    await this.assertBehavior();
    if (this.state.pending) throw new Error('이전 경기가 끝나기 전에 새 경기를 시작할 수 없습니다.');
    if (this.state.consecutiveExcluded >= 3) throw new Error('입력·결과 검증이 3경기 연속 실패했습니다.');
    if (this.state.phase === 'learning') await this.learn();
    if (!this.state.trial && !this.state.batch.length) await this.offerSimulation();
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
    const row: Completed = {
      ...plan,
      result: episode.result,
      episodeSHA256: await sealedDigest(plan.directory),
    };
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
    await verifyTrainingBatch(batch, this.experiment());
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
    this.state.trial = await registerTrial(this.experiment());
    this.state.phase = 'evaluating';
    await this.save();
  }

  // 학습 묶음과 평가가 비어 있을 때 감독이 넘긴 시뮬레이터 챔피언을 같은 실전 게이트로 비교한다.
  private async offerSimulation() {
    if (!(await adoptSimulationOffer(this.control, this.state, this.learner))) return;
    this.state.trial = await registerTrial(this.experiment());
    this.state.phase = 'evaluating';
    await this.save();
  }

  private async finishEvaluation() {
    const trial = this.state.trial;
    if (!trial) return;
    const { complete, futile } = trialProgress(trial);
    if (!complete && !futile) return;
    await this.assertBehavior();
    await verifyTrial(trial, this.experiment());
    const source = candidateSource(this.state);
    const report = { ...trialReport(trial, this.state.behaviorSHA256), candidateSource: source };
    const passed = report.gate.passed;
    const reportPath = join(this.root, 'evaluations', trial.id + '.json');
    await atomicWrite(reportPath, JSON.stringify(report, null, 2) + '\n');
    if (passed) {
      await publishChampion(trial, this.experiment(), reportPath);
      this.state.champion = trial.candidate;
      this.state.promotions++;
    }
    settleSimulationTrial(this.state, passed);
    this.state.lastEvaluation = { report: reportPath, passed, gate: report.gate, candidateSource: source };
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
