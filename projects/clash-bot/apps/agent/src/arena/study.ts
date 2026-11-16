import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { LearningClient } from '../qwen/learning-client.ts';
import { acquireLearningLock } from '../shared/runtime-lock.ts';

export async function studyNext(
  client: LearningClient,
  dataDir: string,
  dataset?: string,
  mode: 'isolated' | 'candidate' = 'isolated',
) {
  const root = join(dataDir, 'arena/qwen');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const journal = join(root, 'studies.jsonl');
  const previous = await readFile(journal, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const learned = new Set(
    previous
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { datasetSHA256: string }).datasetSHA256),
  );
  const entries = dataset
    ? [resolve(dataset)]
    : (
        await readdir(join(dataDir, 'arena/exports')).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [] as string[];
          throw error;
        })
      )
        .sort()
        .map((directory) => join(dataDir, 'arena/exports', directory, 'dataset.json'));
  const controller = mode === 'candidate' ? (await client.status()).controller_version : undefined;
  for (const path of entries) {
    const raw = await readFile(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null; // A self-play export is still being written.
      throw error;
    });
    if (!raw) continue;
    if (mode === 'candidate') {
      const body = JSON.parse(raw.toString()) as { format: string; controllerVersion?: number };
      if (typeof controller === 'number' && controller >= 2 && body.controllerVersion !== controller)
        continue;
    }
    const identity = createHash('sha256').update(raw).digest('hex');
    if (learned.has(identity)) continue;
    const before = await client.status();
    const result = mode === 'candidate' ? await client.studyCandidate(path) : await client.study(path);
    const after = await client.status();
    if (
      before.champion_sha256 !== after.champion_sha256 ||
      before.champion_version !== after.champion_version ||
      (mode === 'isolated' &&
        (before.weights_sha256 !== after.weights_sha256 || before.version !== after.version))
    )
      throw new Error('수읽기 자료 학습이 현재 실전 모델을 바꿨습니다.');
    const report = {
      ...result,
      activeUnchanged: mode === 'isolated',
      championUnchanged: true,
      mode,
      datasetSHA256: identity,
      dataset: path,
      at: new Date().toISOString(),
    };
    await appendFile(journal, JSON.stringify(report) + '\n', { mode: 0o600 });
    return report;
  }
  return { updated: false, reason: 'no_new_search_dataset' };
}

export async function runStudy(dataDir: string, args: string[]) {
  const index = args.indexOf('--dataset');
  if (args.length && (index !== 0 || args.length !== 2))
    throw new Error('arena study [--dataset <자료 파일>]');
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const client = new LearningClient(dataDir);
  try {
    await client.ready();
    console.log(JSON.stringify(await studyNext(client, dataDir, args[index + 1]), null, 2));
  } finally {
    client.close();
    await lock.release();
  }
}
