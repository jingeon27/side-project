import { appendFile, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import { studyNext } from '../../arena/study.ts';
import type { SpawnPatterns } from '../../core/battle/spawn-patterns.ts';
import type { Profile } from '../../core/profile.ts';
import type { LearningClient } from '../../qwen/learning-client.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { CounterpushBrowser } from '../browser/browser.ts';
import { controllerFor } from '../match/controllers.ts';
import { playCounterpushEpisode } from '../match/episode.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import { learnCounterpushEpisodes } from './episode-learning.ts';
import type { EvolutionState, PolicySnapshot, TrainingEpisode } from './qualified-loop.ts';

export const snapshot = (record: Record<string, unknown>): PolicySnapshot => {
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

export async function initialCandidate(dataDir: string, champion: PolicySnapshot) {
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

// 비공개 후보의 준비·학습 경기·학습·탐색 단계다. 단계 순서와 상태 저장은 qualifiedLearningLoop가 소유한다.
export function candidateTraining({
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
}: {
  options: { dataDir: string; profile: Profile; signal: AbortSignal };
  dataDir: string;
  control: string;
  state: EvolutionState;
  runtime: { completed: number; updates: number };
  client: LearningClient;
  vision: CounterpushVisionClient;
  browser: CounterpushBrowser;
  patterns: SpawnPatterns;
  report: (update: Record<string, unknown>) => Promise<void>;
}) {
  const studyCurrentCandidate = () => {
    if (!state.candidateDirectory) throw new Error('후보 없이 탐색 자료를 학습할 수 없습니다.');
    return studyNext(client, dataDir, { mode: 'candidate', learner: state.candidateDirectory });
  };
  return {
    begin: async (directory: string) => {
      await client.beginCandidate(directory);
      const configured = await client.configureCandidate();
      await report({ phase: 'warming_fast_policy' });
      await client.warmup();
      const base = Number(configured.warmup_base_datasets ?? 0);
      for (const round of [1, 2, 3, 4]) {
        const current = await client.status();
        if ((Array.isArray(current.search_datasets) ? current.search_datasets.length : 0) >= base + 4) break;
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
        controller: await controllerFor(client),
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
    learn: async (episode: TrainingEpisode) => {
      await report({ phase: 'candidate_learning', activeRole: 'candidate_training' });
      const trained = (await learnCounterpushEpisodes(client, dataDir, [episode], options.profile))[0]!;
      if (trained.training.updated) runtime.updates++;
      await appendFile(
        join(control, 'matches.jsonl'),
        JSON.stringify({
          ...episode,
          training: trained.training,
          deployment: 'private_candidate',
          at: dayjs().toISOString(),
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
  };
}
