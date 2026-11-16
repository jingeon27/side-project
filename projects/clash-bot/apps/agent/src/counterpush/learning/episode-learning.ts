import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LearningClient } from '../../qwen/learning-client.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { readEpisodeCoverage } from './audit.ts';
import { prepareOpponentDataset } from './opponent-data.ts';

export async function learnCounterpushEpisodes(
  client: LearningClient,
  dataDir: string,
  episodes: Array<{ directory: string; opponentActions: number }>,
) {
  const owner = await client.status();
  const receiptPath =
    episodes.length === 1 && owner.role === 'candidate_training'
      ? join(episodes[0]!.directory, 'candidate-learning.json')
      : null;
  const receipt = receiptPath
    ? await readFile(receiptPath, 'utf8')
        .then(
          (raw) =>
            JSON.parse(raw) as {
              directory: string;
              own?: Awaited<ReturnType<LearningClient['train']>>;
              opponent?: Awaited<ReturnType<LearningClient['imitate']>>;
            },
        )
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        })
    : null;
  if (receipt && receipt.directory !== owner.directory)
    throw new Error('학습 재개 기록이 다른 후보 모델에 속합니다.');
  // PPO consumes the exact behavior policy first. Demonstration features are
  // computed only afterwards, using the newly current adapter.
  const own =
    receipt?.own ??
    (episodes.length === 1
      ? await client.train(episodes[0]!.directory)
      : await client.trainBatch(episodes.map((episode) => episode.directory)));
  if (receiptPath)
    await atomicWrite(receiptPath, JSON.stringify({ ...receipt, directory: owner.directory, own }) + '\n');
  const trained = [];
  for (const episode of episodes) {
    const dataset = episode.opponentActions
      ? await prepareOpponentDataset(join(episode.directory, 'observations.json'), dataDir)
      : null;
    const opponent =
      receipt?.opponent ??
      (dataset?.samples
        ? await client.imitate(dataset.path)
        : { updated: false, reason: 'no_confirmed_opponent_actions' });
    if (receiptPath)
      await atomicWrite(receiptPath, JSON.stringify({ directory: owner.directory, own, opponent }) + '\n');
    const policy = await client.status();
    const summaryPath = join(episode.directory, 'summary.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
    const coverage = await readEpisodeCoverage(episode.directory, { opponent, dataset });
    const training = { updated: own.updated || opponent.updated, own, opponent, policy, dataset, coverage };
    await atomicWrite(summaryPath, JSON.stringify({ ...summary, training }, null, 2) + '\n');
    trained.push({ episode, training });
  }
  return trained;
}
