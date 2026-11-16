import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { studyNext } from '../../arena/study.ts';
import { LearningClient } from '../../qwen/learning-client.ts';
import { MODEL } from '../../qwen/model.ts';
import { startSharedInference } from '../../qwen/shared-inference.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { type Profile } from '../../shared/config.ts';
import { readOptionalJsonFile } from '../../shared/json-file.ts';
import { acquireLearningLock, stopRequested } from '../../shared/runtime-lock.ts';
import { SpawnPatterns } from '../domain/spawn-patterns.ts';
import { learnCounterpushEpisodes } from '../learning/episode-learning.ts';
import { evaluateWithResources } from '../learning/evaluation.ts';
import {
  evolutionStateSchema,
  qualifiedLearningLoop,
  type EvolutionState,
  type PolicySnapshot,
} from '../learning/qualified-loop.ts';
import { goalProgress, resumeTrainingGoal, trainingGoalSchema } from '../learning/training-goal.ts';
import { CounterpushVisionClient } from '../perception/vision-client.ts';
import { CounterpushBrowser } from './browser.ts';
import { playCounterpushEpisode } from './episode.ts';

const snapshot = (record: Record<string, unknown>): PolicySnapshot => {
  const row = z
    .object({
      version: z.int().nonnegative(),
      weights_sha256: z.string().length(64),
      directory: z.string(),
      checkpoint: z.string(),
      qualification: z.object({ report: z.string() }).passthrough().optional(),
    })
    .passthrough()
    .parse(record);
  return {
    version: row.version,
    weightsSHA256: row.weights_sha256,
    directory: row.directory,
    checkpoint: row.checkpoint,
    ...(row.qualification ? { qualificationReport: row.qualification.report } : {}),
  };
};

async function initialCandidate(dataDir: string, champion: PolicySnapshot) {
  const raw = await readFile(join(dataDir, 'arena/qwen/studies.jsonl'), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    },
  );
  const rows = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const found = rows
    .reverse()
    .find(
      (row) =>
        row.updated === true &&
        row.baseline_sha256 === champion.weightsSHA256 &&
        typeof row.candidate_checkpoint === 'string',
    );
  return found ? dirname(dirname(String(found.candidate_checkpoint))) : null;
}

export async function runCounterpush(options: {
  dataDir: string;
  profile: Profile;
  hours: number;
  matches: number;
  tabs?: number;
  pairs?: number;
  trainingMatches?: number;
  trainingGoal?: number;
  signal: AbortSignal;
}) {
  const { dataDir, signal } = options;
  const pairs = options.pairs ?? 16,
    trainingMatches = options.trainingMatches ?? 8;
  if ((options.tabs ?? 1) !== 1)
    throw new Error(
      '현재 Counterpush 계정은 다른 탭의 게임이 시작되면 기존 경기를 닫습니다. --tabs 1로 실행하세요.',
    );
  if (
    !Number.isInteger(pairs) ||
    pairs < 16 ||
    pairs > 128 ||
    !Number.isInteger(trainingMatches) ||
    trainingMatches < 1 ||
    trainingMatches > 128
  )
    throw new Error('자동 채택은 최소 16쌍 평가와 1~128판의 후보 학습을 요구합니다.');
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
    tabs: 1,
    qualificationRequired: true,
    settings: { hours: options.hours, pairs, trainingMatches },
  };
  const runtime = { completed: 0, updates: 0 };
  const resources: {
    client: LearningClient | null;
    vision: CounterpushVisionClient | null;
    browser: CounterpushBrowser | null;
    patterns: SpawnPatterns | null;
    shared: Awaited<ReturnType<typeof startSharedInference>> | null;
  } = {
    client: null,
    vision: null,
    browser: null,
    patterns: null,
    shared: null,
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
    resources.shared = await startSharedInference({
      dataDir,
      client,
      policy: () => (status.phase === 'candidate_training' && state.candidate ? state.candidate : null),
    });
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
    const studyCurrentCandidate = () => {
      if (!state.candidateDirectory) throw new Error('후보 없이 탐색 자료를 학습할 수 없습니다.');
      return studyNext(client, dataDir, { mode: 'candidate', learner: state.candidateDirectory });
    };
    const result = await qualifiedLearningLoop({
      state,
      trainingMatches,
      stopped,
      newCandidateDirectory: () => join(dataDir, 'arena/qwen/training', randomUUID()),
      newEvaluationFile: () =>
        join(control, 'evaluations', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`),
      begin: async (directory) => {
        await client.beginCandidate(directory);
        const configured = await client.configureCandidate();
        await report({ phase: 'warming_fast_policy' });
        await client.warmup();
        const base = Number(configured.warmup_base_datasets ?? 0);
        for (const round of [1, 2, 3, 4]) {
          const current = await client.status();
          if ((Array.isArray(current.search_datasets) ? current.search_datasets.length : 0) >= base + 4)
            break;
          await report({ phase: 'curriculum_warmup', warmupRound: round });
          const study = await studyNext(client, dataDir, { mode: 'candidate', learner: directory });
          if (!study.updated) break;
          await report({ searchStudy: study });
        }
        return snapshot(await client.status());
      },
      restore: async () => {
        const current = await client.endCandidate();
        await report({ policy: current });
        return snapshot(current);
      },
      play: async () => {
        const disk = await statfs(dataDir);
        if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw new Error('남은 디스크가 8GB 미만입니다.');
        const episode = await playCounterpushEpisode({
          ...options,
          client,
          vision,
          browser,
          patterns,
          persistPatterns: false,
          report: async (update) =>
            report({ ...update, phase: 'candidate_training', activeRole: 'candidate_training' }),
        });
        runtime.completed++;
        await atomicWrite(
          join(episode.directory, 'qualification.json'),
          JSON.stringify({ role: 'candidate_training', directory: state.candidateDirectory }) + '\n',
        );
        return episode;
      },
      learn: async (episode) => {
        await report({ phase: 'candidate_learning', activeRole: 'candidate_training' });
        const trained = (await learnCounterpushEpisodes(client, dataDir, [episode]))[0]!;
        if (trained.training.updated) runtime.updates++;
        await appendFile(
          join(control, 'matches.jsonl'),
          JSON.stringify({
            ...episode,
            training: trained.training,
            deployment: 'private_candidate',
            at: new Date().toISOString(),
          }) + '\n',
          { mode: 0o600 },
        );
        await patterns.save();
        await report({
          candidatePolicy: await client.status(),
          training: trained.training,
          lastResult: episode.result,
          completed: runtime.completed,
          updates: runtime.updates,
        });
        const replayReceipt = join(episode.directory, 'candidate-rehearsal.json');
        const previousReplay = await readFile(replayReceipt, 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (!previousReplay) {
          const searchStudy = await studyCurrentCandidate();
          const rehearsal = await client.rehearse(4);
          await atomicWrite(replayReceipt, JSON.stringify({ searchStudy, rehearsal }) + '\n');
          await report({ searchStudy, rehearsal, candidatePolicy: await client.status() });
        }
      },
      study: async () => {
        await report({ phase: 'candidate_study' });
        const searchStudy = await studyCurrentCandidate();
        await report({ searchStudy, candidatePolicy: await client.status() });
      },
      evaluate: async (candidate, evaluationFile) => {
        const evaluation = await evaluateWithResources({
          ...options,
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
        // 상태 파일을 먼저 쓴 뒤, 진행 중인 트로피 경기가 끝날 때까지 후보 공유를 닫는 단계 보고를 미룬다.
        if (
          status.phase === 'candidate_training' &&
          current.phase !== 'candidate_training' &&
          resources.shared?.activeMatch()
        ) {
          await report({ waitingFor: 'trophy_match' });
          await resources.shared.matchFinished(signal);
        }
        await report({
          waitingFor: null,
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
    await resources.browser?.screenshot(join(control, 'last-error-tab1.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await resources.shared?.close().catch(() => {});
    // 워커가 끝난 뒤에 잠금을 풀어, 이전 학습기가 체크포인트를 쓰는 중에 새 실행이 시작되지 않게 한다.
    await Promise.all([resources.client?.close(), resources.vision?.close()]);
    await resources.patterns?.save().catch(() => {});
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
