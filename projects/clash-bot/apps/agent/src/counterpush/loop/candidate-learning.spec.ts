import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { DEFAULT_PROFILE } from '../../core/profile.ts';
import type { LearningClient } from '../../qwen/learning-client.ts';
import { learnCounterpushEpisodes } from './episode-learning.ts';

vi.mock('../learning/opponent-data.ts', () => ({
  prepareOpponentDataset: vi.fn(async () => ({ path: '/dataset', sha256: 'mirror-hash', samples: 1 })),
}));
vi.mock('../learning/audit.ts', () => ({ readEpisodeCoverage: vi.fn(async () => ({})) }));

it('resumes opponent learning after PPO without replaying an already applied private update', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-candidate-'));
  try {
    await writeFile(join(directory, 'summary.json'), '{}');
    const client = {
      status: vi.fn(async () => ({ role: 'candidate_training', directory: '/private', version: 2 })),
      train: vi.fn(async () => ({ updated: true, version: 2 })),
      imitate: vi
        .fn()
        .mockRejectedValueOnce(new Error('process interrupted'))
        .mockResolvedValue({ updated: true, version: 3, dataset_sha256: 'mirror-hash' }),
    };
    const episode = { directory, opponentActions: 1 };
    await expect(
      learnCounterpushEpisodes(client as unknown as LearningClient, directory, [episode], DEFAULT_PROFILE),
    ).rejects.toThrow('interrupted');
    const receipt = JSON.parse(await readFile(join(directory, 'candidate-learning.json'), 'utf8'));
    expect(receipt.own.updated).toBe(true);
    await learnCounterpushEpisodes(
      client as unknown as LearningClient,
      directory,
      [episode],
      DEFAULT_PROFILE,
    );
    await learnCounterpushEpisodes(
      client as unknown as LearningClient,
      directory,
      [episode],
      DEFAULT_PROFILE,
    );
    expect(client.train).toHaveBeenCalledOnce();
    expect(client.imitate).toHaveBeenCalledTimes(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
