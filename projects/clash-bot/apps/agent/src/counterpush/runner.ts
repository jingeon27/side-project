import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { studyNext } from '../arena-study.ts';
import { atomicWrite } from '../assets.ts';
import { type Profile } from '../config.ts';
import { LearningClient } from '../learning-client.ts';
import { selectModel, type ModelId } from '../model-options.ts';
import { acquireLearningLock } from '../selfplay.ts';
import { CounterpushBrowser } from './browser.ts';
import { learnCounterpushEpisodes, playCounterpushEpisode } from './episode.ts';
import { evaluateWithResources } from './evaluation.ts';
import { qualifiedLearningLoop, type EvolutionState, type PolicySnapshot } from './qualified-loop.ts';
import { SpawnPatterns } from './spawn-patterns.ts';
import { CounterpushVisionClient } from './vision-client.ts';

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
  model: ModelId;
  hours: number;
  matches: number;
  tabs?: number;
  pairs?: number;
  trainingMatches?: number;
  signal: AbortSignal;
}) {
  const { dataDir, model, signal } = options;
  const pairs = options.pairs ?? 16,
    trainingMatches = options.trainingMatches ?? 2;
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
    trainingMatches > 32
  )
    throw new Error('자동 채택은 최소 16쌍 평가와 1~32판의 후보 학습을 요구합니다.');
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    model: selectModel(model, true).name,
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
    resources.client?.close();
    resources.vision?.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const championDir = join(dataDir, 'qwen', selectModel(model, true).checkpoint_directory);
    const policyFile = join(championDir, 'promotion-policy.json');
    if (
      !(await readFile(policyFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }))
    )
      await atomicWrite(
        policyFile,
        JSON.stringify({
          format: 'qualified-champion-only-v1',
          enabled: true,
          minimumPairs: 16,
          confidenceBudget: 0.05,
        }) + '\n',
      );
    await report({ phase: 'loading' });
    const client = new LearningClient(dataDir, model),
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
    const stored = await readFile(file, 'utf8')
      .then((raw) => JSON.parse(raw) as EvolutionState)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
    if (stored && stored.format !== 'counterpush-qualified-learning-v1')
      throw new Error('알 수 없는 학습 실행 기록입니다.');
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
    const stopped = async () => {
      if (
        signal.aborted ||
        Date.now() >= deadline ||
        (options.matches > 0 && runtime.completed >= options.matches)
      )
        return true;
      const stop = await readFile(join(dataDir, 'qwen/selfplay/stop.json'), 'utf8').catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        },
      );
      return stop !== null && (JSON.parse(stop) as { id: string }).id === lock.owner.id;
    };
    await report({ phase: 'ready', policy, champion });
    const result = await qualifiedLearningLoop({
      state,
      trainingMatches,
      stopped,
      newCandidateDirectory: () => join(dataDir, 'arena/qwen/training', randomUUID()),
      newEvaluationFile: () =>
        join(control, 'evaluations', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`),
      begin: async (directory) => snapshot(await client.beginCandidate(directory)),
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
      },
      study: async () => {
        await report({ phase: 'candidate_study' });
        const searchStudy = await studyNext(client, dataDir, undefined, 'candidate');
        await report({ searchStudy, candidatePolicy: await client.status() });
      },
      evaluate: async (candidate, evaluationFile) =>
        evaluateWithResources({
          ...options,
          client,
          vision,
          browser,
          pairs,
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
        }),
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
    resources.client?.close();
    resources.vision?.close();
    await resources.patterns?.save().catch(() => {});
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
