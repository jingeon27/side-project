import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SpawnPatterns } from '../../core/battle/spawn-patterns.ts';
import type { Profile } from '../../core/profile.ts';
import { LearningClient } from '../../qwen/learning-client.ts';
import { MODEL } from '../../qwen/model.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { readOptionalJsonFile } from '../../shared/json-file.ts';
import { acquireLearningLock, stopRequested } from '../../shared/runtime-lock.ts';
import { CounterpushBrowser } from '../browser/browser.ts';
import { CounterpushVisionClient } from '../perception/vision-client.ts';
import { behaviorIdentity } from './behavior-identity.ts';
import { candidateTraining, initialCandidate, snapshot } from './candidate-training.ts';
import { evaluateWithResources } from './evaluation-trial.ts';
import { evolutionStateSchema, qualifiedLearningLoop, type EvolutionState } from './qualified-loop.ts';
import { goalProgress, resumeTrainingGoal, trainingGoalSchema } from './training-goal.ts';

export async function runCounterpush(options: {
  dataDir: string;
  profile: Profile;
  hours: number;
  matches: number;
  pairs?: number;
  trainingMatches?: number;
  trainingGoal?: number;
  signal: AbortSignal;
}) {
  const { dataDir, signal } = options;
  const pairs = options.pairs ?? 16,
    trainingMatches = options.trainingMatches ?? 8;
  if (
    !Number.isInteger(pairs) ||
    pairs < 16 ||
    pairs > 128 ||
    !Number.isInteger(trainingMatches) ||
    trainingMatches < 1 ||
    trainingMatches > 128
  )
    throw new Error('자동 채택은 최소 16쌍 평가와 1~128판의 후보 학습을 요구합니다.');
  const behaviorSHA256 = await behaviorIdentity(options.profile);
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    model: MODEL.name,
    phase: 'loading',
    completed: 0,
    updates: 0,
    promotions: 0,
    qualificationRequired: true,
    behaviorSHA256,
    settings: { hours: options.hours, pairs, trainingMatches },
  };
  const runtime = { completed: 0, updates: 0 };
  const resources: {
    client: LearningClient | null;
    vision: CounterpushVisionClient | null;
    browser: CounterpushBrowser | null;
    patterns: SpawnPatterns | null;
  } = {
    client: null,
    vision: null,
    browser: null,
    patterns: null,
  };
  const writes = { tail: Promise.resolve() };
  const report = (update: Record<string, unknown>) => {
    const write = writes.tail.then(async () => {
      Object.assign(status, update, { updatedAt: new Date().toISOString() });
      await atomicWrite(join(control, 'status.json'), JSON.stringify(status, null, 2) + '\n');
    });
    writes.tail = write.catch(() => {});
    return write;
  };
  const abort = () => {
    void resources.client?.close();
    void resources.vision?.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'loading' });
    const client = new LearningClient(dataDir),
      vision = new CounterpushVisionClient(dataDir);
    resources.client = client;
    resources.vision = vision;
    await client.ready();
    await vision.ready();
    const browser = await CounterpushBrowser.open(dataDir);
    resources.browser = browser;
    const patterns = await SpawnPatterns.open(join(dataDir, 'counterpush/patterns/graveyard.json'));
    resources.patterns = patterns;
    const policy = await client.status();
    const champion = snapshot(policy);
    const file = join(control, 'evolution.json');
    const stored = await readOptionalJsonFile(file, evolutionStateSchema);
    const state: EvolutionState = stored ?? {
      format: 'counterpush-qualified-learning-v1',
      phase: 'initializing',
      champion,
      candidateDirectory: await initialCandidate(dataDir, champion),
      candidate: null,
      pendingEpisode: null,
      trainingGames: 0,
      trainingEpisodes: 0,
      comparisons: 0,
      promotions: 0,
      evaluationFile: null,
    };
    const deadline = options.hours ? Date.now() + options.hours * 3_600_000 : Infinity;
    const goalFile = join(control, 'training-goal.json');
    const previousGoal = options.trainingGoal
      ? await readOptionalJsonFile(goalFile, trainingGoalSchema)
      : null;
    const resumed = options.trainingGoal
      ? resumeTrainingGoal(previousGoal, options.trainingGoal, state)
      : null;
    if (resumed?.completed) {
      // 완료된 목표를 보관한 뒤 새 목표를 기록해, 같은 판수로 다시 실행해도 학습 없이 끝나지 않게 한다.
      const completedAt = resumed.completed.completedAt ?? resumed.completed.createdAt;
      await atomicWrite(
        join(control, 'training-goals', `${completedAt.replaceAll(':', '-')}.json`),
        JSON.stringify(resumed.completed, null, 2) + '\n',
      );
      await atomicWrite(goalFile, JSON.stringify(resumed.goal, null, 2) + '\n');
    }
    const goal = resumed?.goal ?? null;
    const stopped = async () => {
      if (
        signal.aborted ||
        Date.now() >= deadline ||
        (options.matches > 0 && runtime.completed >= options.matches)
      )
        return true;
      if (goal && goalProgress(goal, state).complete) return true;
      return stopRequested(join(dataDir, 'qwen/selfplay'), lock.owner.id);
    };
    await report({ phase: 'ready', policy, champion });
    const result = await qualifiedLearningLoop({
      state,
      trainingMatches,
      stopped,
      newCandidateDirectory: () => join(dataDir, 'arena/qwen/training', randomUUID()),
      newEvaluationFile: () =>
        join(control, 'evaluations', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`),
      ...candidateTraining({
        options,
        dataDir,
        control,
        state,
        runtime,
        client,
        vision,
        browser,
        patterns,
        report,
      }),
      evaluate: async (candidate, evaluationFile) => {
        const evaluation = await evaluateWithResources({
          ...options,
          behaviorSHA256,
          client,
          vision,
          browser,
          pairs,
          rejectFutile: true,
          candidate: candidate.checkpoint,
          file: evaluationFile,
          stopped,
          onGame: () => {
            runtime.completed++;
          },
          report: async (update) =>
            report({
              ...update,
              evaluationCompleted: update.completed,
              completed: runtime.completed,
              activeRole: 'heldout_evaluation',
              evaluationFile,
            }),
        });
        // The raw report stays incomplete and cannot publish a model. A
        // mathematically futile rejection can still return to training.
        return { ...evaluation, complete: evaluation.complete || evaluation.rejectedEarly };
      },
      promote: async (candidate, evaluationFile) => {
        const publication = await client.promote(candidate.checkpoint, evaluationFile);
        await appendFile(
          join(control, 'promotions.jsonl'),
          JSON.stringify({ ...publication, at: new Date().toISOString() }) + '\n',
          { mode: 0o600 },
        );
        await report({ publication });
        return snapshot(await client.status());
      },
      save: async (current) => {
        await atomicWrite(file, JSON.stringify(current, null, 2) + '\n');
        const progress = goal ? goalProgress(goal, current) : null;
        if (progress) await atomicWrite(goalFile, JSON.stringify(progress, null, 2) + '\n');
        await report({
          phase: current.phase,
          champion: current.champion,
          candidate: current.candidate,
          promotions: current.promotions,
          comparisons: current.comparisons,
          trainingEpisodes: current.trainingEpisodes,
          lastDecision: current.lastDecision,
          completed: runtime.completed,
          updates: runtime.updates,
          ...(progress ? { trainingGoal: progress } : {}),
        });
      },
    });
    await report({
      phase: 'stopped',
      champion: result.champion,
      candidate: result.candidate,
      promotions: result.promotions,
    });
    return result;
  } catch (error) {
    await resources.browser?.screenshot(join(control, 'last-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    // 워커가 끝난 뒤에 잠금을 풀어, 이전 학습기가 체크포인트를 쓰는 중에 새 실행이 시작되지 않게 한다.
    await Promise.all([resources.client?.close(), resources.vision?.close()]);
    await resources.patterns?.save().catch(() => {});
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
