import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import { LearningClient } from '../qwen/learning-client.ts';
import { acquireLearningLock } from '../shared/runtime-lock.ts';

// 격리 학습은 자료마다 새 후보를 만들므로 전체 기록으로 중복을 막는다. 실전 후보는 그 후보가 이미 시도한 자료만 건너뛴다.
type StudyTarget = { mode: 'isolated' } | { mode: 'candidate'; learner: string };
const journalRowSchema = z.object({
  datasetSHA256: z.string(),
  mode: z.string().optional(),
  learner: z.string().optional(),
});

export async function studyNext(
  client: Pick<LearningClient, 'status' | 'study' | 'studyCandidate'>,
  dataDir: string,
  target: StudyTarget = { mode: 'isolated' },
  dataset?: string,
) {
  const root = join(dataDir, 'arena/qwen');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const journal = join(root, 'studies.jsonl');
  const previous = await readFile(journal, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const rows = previous
    .split('\n')
    .filter(Boolean)
    .map((line) => journalRowSchema.parse(JSON.parse(line)));
  const status = target.mode === 'candidate' ? await client.status() : null;
  const learned = new Set(
    target.mode === 'candidate'
      ? [
          ...rows
            .filter((row) => row.mode === 'candidate' && row.learner === target.learner)
            .map((row) => row.datasetSHA256),
          // 기록에 후보 이름이 없던 시기에 이 후보가 학습한 자료는 Python 학습기 메타데이터에 남아 있다.
          ...z.array(z.string()).default([]).parse(status?.search_datasets),
        ]
      : rows.map((row) => row.datasetSHA256),
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
  const controller = status?.controller_version;
  for (const path of entries) {
    const raw = await readFile(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null; // A self-play export is still being written.
      throw error;
    });
    if (!raw) continue;
    if (target.mode === 'candidate') {
      const body = JSON.parse(raw.toString()) as { format: string; controllerVersion?: number };
      if (typeof controller === 'number' && controller >= 2 && body.controllerVersion !== controller)
        continue;
    }
    const identity = createHash('sha256').update(raw).digest('hex');
    if (learned.has(identity)) continue;
    const before = await client.status();
    const result = target.mode === 'candidate' ? await client.studyCandidate(path) : await client.study(path);
    const after = await client.status();
    if (
      before.champion_sha256 !== after.champion_sha256 ||
      before.champion_version !== after.champion_version ||
      (target.mode === 'isolated' &&
        (before.weights_sha256 !== after.weights_sha256 || before.version !== after.version))
    )
      throw new Error('수읽기 자료 학습이 현재 실전 모델을 바꿨습니다.');
    const report = {
      ...result,
      activeUnchanged: target.mode === 'isolated',
      championUnchanged: true,
      ...target,
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
    console.log(
      JSON.stringify(await studyNext(client, dataDir, { mode: 'isolated' }, args[index + 1]), null, 2),
    );
  } finally {
    await client.close();
    await lock.release();
  }
}
