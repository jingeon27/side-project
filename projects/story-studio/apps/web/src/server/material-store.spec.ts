import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { dataPath } from './assets';
import { StudioError } from './errors';
import { addMaterials, deleteMaterial, listMaterials } from './material-store';

const worker = vi.hoisted(() => ({ run: vi.fn(), ready: true }));
vi.mock('./local-worker', () => ({
  localConfiguration: () => ({ materialReady: worker.ready }),
  runLocal: worker.run,
}));
type TIndexRequest = { action: string; documents?: { id: string }[]; ids?: string[] };
const state = { directory: '' };
const upload = {
  collection: '무협 설정',
  documents: [
    { title: '강호 용어집', text: '경공은 몸을 가볍게 하는 무공이다.' },
    { title: '객잔 묘사', text: '객잔의 저녁은 술 냄새로 시작한다.' },
  ],
};
function indexEvery(request: TIndexRequest) {
  if (request.action === 'delete-material') return { deleted: request.ids?.length };
  return { documents: request.documents?.map((document) => ({ id: document.id, passages: 1 })) };
}
async function stored(folder: 'documents' | 'files') {
  return readdir(dataPath('materials', folder)).catch(() => []);
}
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-materials-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  worker.ready = true;
  worker.run.mockReset();
  worker.run.mockImplementation(async (request: TIndexRequest) => indexEvery(request));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('자료 본문을 저장하고 엔진에 색인을 맡긴 뒤 묶음과 검색 단위 수를 목록에 남긴다', async () => {
  expect(await listMaterials()).toEqual([]);
  const added = await addMaterials(upload);
  expect(added.map((material) => material.title)).toEqual(['강호 용어집', '객잔 묘사']);
  const request = worker.run.mock.calls[0]?.[0] as TIndexRequest;
  expect(request).toMatchObject({
    action: 'index-material',
    documents: [
      { id: added[0]?.id, title: '강호 용어집', collection: '무협 설정' },
      { id: added[1]?.id, title: '객잔 묘사', collection: '무협 설정' },
    ],
  });
  // The engine reads each text from the data folder; the request itself carries no document text.
  expect(JSON.stringify(request)).not.toContain('경공');
  expect(await readFile(dataPath('materials', 'files', `${added[0]?.id}.txt`), 'utf8')).toBe(
    upload.documents[0]?.text,
  );
  expect(await listMaterials()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: '강호 용어집',
        collection: '무협 설정',
        characters: upload.documents[0]?.text.length,
        passages: 1,
      }),
      expect.objectContaining({ title: '객잔 묘사', passages: 1 }),
    ]),
  );
});

it('색인이 실패하면 본문과 일부 색인을 정리해 목록에 남기지 않고, 다시 올릴 수 있다', async () => {
  worker.run.mockImplementationOnce(async () => {
    throw new StudioError('로컬 모델 실행에 실패했습니다.');
  });
  await expect(addMaterials(upload)).rejects.toThrow('로컬 모델 실행');
  expect(worker.run.mock.calls[1]?.[0]).toMatchObject({ action: 'delete-material' });
  expect((worker.run.mock.calls[1]?.[0] as TIndexRequest).ids).toHaveLength(2);
  expect(await stored('documents')).toEqual([]);
  expect(await stored('files')).toEqual([]);
  expect(await addMaterials(upload)).toHaveLength(2);
  expect(await listMaterials()).toHaveLength(2);
});

it('검색 모델이 없으면 아무것도 저장하지 않고 설치를 안내한다', async () => {
  worker.ready = false;
  await expect(addMaterials(upload)).rejects.toMatchObject({ status: 503 });
  expect(worker.run).not.toHaveBeenCalled();
  expect(await stored('files')).toEqual([]);
});

it('삭제는 색인에서 먼저 지우고, 색인 삭제가 실패하면 목록에 남겨 다시 시도할 수 있게 한다', async () => {
  const [first, second] = await addMaterials(upload);
  worker.run.mockImplementationOnce(async () => {
    throw new StudioError('로컬 Python 실행 환경을 열지 못했습니다.', 503);
  });
  await expect(deleteMaterial(first!.id)).rejects.toMatchObject({ status: 503 });
  expect(await listMaterials()).toHaveLength(2);
  expect(await deleteMaterial(first!.id)).toEqual({ id: first!.id });
  expect(worker.run.mock.calls.at(-1)?.[0]).toEqual({ action: 'delete-material', ids: [first!.id] });
  expect((await listMaterials()).map((material) => material.id)).toEqual([second!.id]);
  expect(await stored('files')).toEqual([`${second!.id}.txt`]);
  await expect(deleteMaterial(first!.id)).rejects.toMatchObject({ status: 404 });
  await expect(deleteMaterial('../documents/x')).rejects.toMatchObject({ status: 400 });
});
