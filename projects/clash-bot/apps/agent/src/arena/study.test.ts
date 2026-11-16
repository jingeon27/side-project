import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { studyNext } from './study.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function dataWithExports(names: string[]) {
  const dataDir = await mkdtemp(join(tmpdir(), 'clash-study-'));
  directories.push(dataDir);
  const datasets = await Promise.all(
    names.map(async (name) => {
      const path = join(dataDir, 'arena/exports', name, 'dataset.json');
      const raw = JSON.stringify({ format: 'counterpush-tactical-targets-v3', controllerVersion: 3, name });
      await mkdir(join(dataDir, 'arena/exports', name), { recursive: true });
      await writeFile(path, raw);
      return { path, sha256: createHash('sha256').update(raw).digest('hex') };
    }),
  );
  return { dataDir, datasets };
}

function candidateClient(searchDatasets: string[] = []) {
  const studied: string[] = [];
  return {
    studied,
    status: async () => ({
      controller_version: 3,
      search_datasets: searchDatasets,
      champion_sha256: 'champion',
      champion_version: 68,
    }),
    study: async () => {
      throw new Error('격리 학습은 이 검사에서 쓰지 않습니다.');
    },
    studyCandidate: async (path: string) => {
      studied.push(path);
      return { updated: true };
    },
  };
}

const journalRow = (dataDir: string, row: Record<string, unknown>) =>
  appendFile(join(dataDir, 'arena/qwen/studies.jsonl'), JSON.stringify(row) + '\n');

// 전체 기록으로 중복을 막아, 거절·채택 뒤 새로 만든 후보가 앞선 후보가 학습한 탐색 자료를 받지 못했다.
it('lets a new candidate study a dataset that an earlier candidate already studied', async () => {
  const { dataDir, datasets } = await dataWithExports(['a', 'b']);
  await mkdir(join(dataDir, 'arena/qwen'), { recursive: true });
  await journalRow(dataDir, {
    mode: 'candidate',
    learner: '/candidates/earlier',
    datasetSHA256: datasets[0]!.sha256,
    updated: true,
  });
  const client = candidateClient();
  const report = await studyNext(client, dataDir, { mode: 'candidate', learner: '/candidates/new' });
  expect(client.studied).toEqual([datasets[0]!.path]);
  expect(report).toMatchObject({ mode: 'candidate', learner: '/candidates/new' });
});

it('skips what the same candidate already tried, including a rejected update and earlier unlabelled successes', async () => {
  const { dataDir, datasets } = await dataWithExports(['a', 'b', 'c']);
  await mkdir(join(dataDir, 'arena/qwen'), { recursive: true });
  await journalRow(dataDir, {
    mode: 'candidate',
    learner: '/candidates/current',
    datasetSHA256: datasets[0]!.sha256,
    updated: false,
  });
  const client = candidateClient([datasets[1]!.sha256]);
  await studyNext(client, dataDir, { mode: 'candidate', learner: '/candidates/current' });
  expect(client.studied).toEqual([datasets[2]!.path]);
});
