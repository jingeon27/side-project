import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { qualifiedLearningLoop, type EvolutionState, type PolicySnapshot } from './qualified-loop.ts';

// TS는 링크 경로, Python은 링크를 푼 경로로 보고서를 기록해 이미 성공한 게시를 챔피언 변경으로 잘못 판정했다.
it('recognizes a committed publication when Python recorded the report through a resolved symlink', async () => {
  const real = await mkdtemp(join(tmpdir(), 'clash-promotion-'));
  const link = `${real}-link`;
  try {
    await symlink(real, link);
    await mkdir(join(real, 'evaluations'));
    await writeFile(join(real, 'evaluations/trial.json'), '{}');
    const candidate: PolicySnapshot = {
      version: 2,
      weightsSHA256: 'b'.repeat(64),
      directory: '/model/2',
      checkpoint: '/model/2/checkpoint',
    };
    const state: EvolutionState = {
      format: 'counterpush-qualified-learning-v1',
      phase: 'promoting',
      champion: {
        version: 1,
        weightsSHA256: 'a'.repeat(64),
        directory: '/model/1',
        checkpoint: '/model/1/c',
      },
      candidateDirectory: '/private',
      candidate,
      pendingEpisode: null,
      trainingGames: 3,
      trainingEpisodes: 3,
      comparisons: 0,
      promotions: 0,
      evaluationFile: join(link, 'evaluations/trial.json'),
    };
    const promote = vi.fn();
    await qualifiedLearningLoop({
      state,
      trainingMatches: 1,
      stopped: async () => true,
      newCandidateDirectory: () => '/unused',
      newEvaluationFile: () => '/unused',
      begin: vi.fn(),
      restore: async () => ({
        ...candidate,
        qualificationReport: join(await realpath(real), 'evaluations/trial.json'),
      }),
      play: vi.fn(),
      learn: vi.fn(),
      study: vi.fn(),
      evaluate: vi.fn(),
      promote,
      save: async () => {},
    });
    expect(promote).not.toHaveBeenCalled();
    expect(state).toMatchObject({ phase: 'promoted', promotions: 1, comparisons: 1, candidate: null });
  } finally {
    await rm(link, { force: true });
    await rm(real, { recursive: true, force: true });
  }
});
