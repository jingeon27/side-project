import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { StudioError } from '../../../shared/server/errors';
import { dataPath } from '../../media/server/assets';
import * as materialStore from './material-store';

const worker = vi.hoisted(() => ({ run: vi.fn(), ready: true }));
vi.mock('../../../shared/server/local-worker', () => ({
  localConfiguration: () => ({ materialReady: worker.ready }),
  runLocal: worker.run,
}));
type TRequest = { action: string; ids?: string[] };
const state = { directory: '' };
const upload = {
  collection: '무협 설정',
  role: 'search' as const,
  documents: [
    { title: '강호 용어집', text: '경공은 몸을 가볍게 하는 무공이다.' },
    { title: '객잔 묘사', text: '객잔의 저녁은 술 냄새로 시작한다.' },
  ],
};
// Each test starts with no sync running and no earlier error. The store keeps that state for the
// whole server process, so it is cleared here instead of loading the module again: a second copy of
// the module would also get a second StudioError class and stop recognizing the errors thrown below.
function load() {
  Object.assign(Reflect.get(globalThis, 'storyStudioMaterials') as object, {
    sync: undefined,
    error: undefined,
    again: false,
  });
  return materialStore;
}
type TStore = typeof materialStore;
async function settled(store: TStore) {
  await vi.waitFor(async () => expect((await store.materialOverview()).sync.running).toBe(false));
  return store.materialOverview();
}
async function catalogIds() {
  const catalog = JSON.parse(await readFile(dataPath('materials', 'catalog.json'), 'utf8')) as {
    documents: { id: string }[];
  };
  return catalog.documents.map((document) => document.id);
}
// What the engine records once it has indexed documents.
async function markIndexed(ids: string[]) {
  await writeFile(
    dataPath('materials', 'index-state.json'),
    JSON.stringify({ documents: Object.fromEntries(ids.map((id) => [id, { passages: 2 }])) }),
  );
}
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-materials-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  worker.ready = true;
  worker.run.mockReset();
  worker.run.mockImplementation(async (request: TRequest) => ({ deleted: request.ids?.length }));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('자료를 목록과 본문으로 저장한 뒤 색인을 맡기고, 색인이 끝나기 전까지 대기로 보여 준다', async () => {
  const store = load();
  expect(await store.addMaterials(upload)).toEqual({ added: 2, skipped: 0 });
  expect(worker.run.mock.calls[0]?.[0]).toEqual({ action: 'sync-material' });
  const ids = await catalogIds();
  expect(await readFile(dataPath('materials', 'files', `${ids[0]}.txt`), 'utf8')).toBe(
    upload.documents[0]?.text,
  );
  expect((await settled(store)).collections).toEqual([{ name: '무협 설정', documents: 2, pending: 2 }]);
  await markIndexed(ids);
  expect((await store.materialOverview()).collections[0]).toMatchObject({ pending: 0 });
  const listed = await store.listCollection('무협 설정');
  expect(listed.total).toBe(2);
  expect(listed.materials.map((material) => material.passages)).toEqual([2, 2]);
  expect(listed.materials[0]).toMatchObject({
    role: 'search',
    digest: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});

it('같은 묶음의 같은 자료를 다시 올리면 건너뛰고 색인도 다시 시작하지 않는다', async () => {
  const store = load();
  await store.addMaterials(upload);
  await settled(store);
  const extra = {
    ...upload,
    documents: [...upload.documents, { title: '새 자료', text: '검기가 허공을 갈랐다.' }],
  };
  expect(await store.addMaterials(upload)).toEqual({ added: 0, skipped: 2 });
  expect(worker.run).toHaveBeenCalledTimes(1);
  expect(await store.addMaterials(extra)).toEqual({ added: 1, skipped: 2 });
  expect(await store.addMaterials({ ...upload, collection: '다른 묶음' })).toEqual({ added: 2, skipped: 0 });
  expect((await settled(store)).collections.map((collection) => collection.documents)).toEqual([2, 3]);
});

it('색인이 실패해도 등록한 자료는 남기고 사유를 보여 주며, 다시 시작하면 사유를 지운다', async () => {
  const store = load();
  worker.run.mockImplementationOnce(async () => {
    throw new StudioError(
      '다른 로컬 생성 작업이 실행 중입니다. 현재 작업이 끝난 뒤 다시 시도해 주세요.',
      409,
    );
  });
  await store.addMaterials(upload);
  const failed = await settled(store);
  expect(failed.sync.error).toContain('다른 로컬 생성 작업');
  expect(failed.collections[0]).toMatchObject({ documents: 2, pending: 2 });
  store.startSync();
  expect((await settled(store)).sync.error).toBeUndefined();
  expect(worker.run).toHaveBeenCalledTimes(2);
});

it('색인 중에 자료가 더 들어오면 끝난 뒤 한 번 더 색인하고, 중단하면 이어서 실행하지 않는다', async () => {
  const store = load();
  const first = Promise.withResolvers<unknown>();
  worker.run.mockImplementationOnce(() => first.promise);
  await store.addMaterials(upload);
  expect((await store.materialOverview()).sync.running).toBe(true);
  await store.addMaterials({ ...upload, collection: '다른 묶음' });
  expect(worker.run).toHaveBeenCalledTimes(1);
  first.resolve({});
  await vi.waitFor(() => expect(worker.run).toHaveBeenCalledTimes(2));
  await settled(store);
  const second = Promise.withResolvers<unknown>();
  worker.run.mockImplementationOnce((_request: TRequest, signal: AbortSignal) => {
    signal.addEventListener('abort', () => second.reject(new DOMException('중단했습니다.', 'AbortError')));
    return second.promise;
  });
  store.startSync();
  store.startSync();
  store.stopSync();
  expect((await settled(store)).sync.error).toContain('중단');
  expect(worker.run).toHaveBeenCalledTimes(3);
});

it('검색 모델이 없어도 자료는 등록해 두고 설치를 안내한다', async () => {
  worker.ready = false;
  const store = load();
  expect(await store.addMaterials(upload)).toEqual({ added: 2, skipped: 0 });
  const overview = await store.materialOverview();
  expect(overview).toMatchObject({ ready: false, sync: { running: false } });
  expect(overview.sync.error).toContain('검색 모델');
  expect(worker.run).not.toHaveBeenCalled();
});

it('삭제는 색인에서 먼저 지우고, 색인 삭제가 실패하면 목록에 남겨 다시 시도할 수 있게 한다', async () => {
  const store = load();
  await store.addMaterials(upload);
  await store.addMaterials({ ...upload, collection: '다른 묶음' });
  await settled(store);
  const first = (await store.listCollection('무협 설정')).materials[0]!;
  worker.run.mockImplementationOnce(async () => {
    throw new StudioError('로컬 Python 실행 환경을 열지 못했습니다.', 503);
  });
  await expect(store.deleteMaterial(first.id)).rejects.toMatchObject({ status: 503 });
  expect((await store.listCollection('무협 설정')).total).toBe(2);
  expect(await store.deleteMaterial(first.id)).toEqual({ deleted: 1 });
  expect(worker.run.mock.calls.at(-1)?.[0]).toEqual({ action: 'delete-material', ids: [first.id] });
  expect((await store.listCollection('무협 설정')).total).toBe(1);
  expect(await readdir(dataPath('materials', 'files'))).not.toContain(`${first.id}.txt`);
  await expect(store.deleteMaterial(first.id)).rejects.toMatchObject({ status: 404 });
  await expect(store.deleteMaterial('../catalog')).rejects.toMatchObject({ status: 400 });
  expect(await store.deleteCollection('다른 묶음')).toEqual({ deleted: 2 });
  expect((await store.materialOverview()).collections.map((collection) => collection.name)).toEqual([
    '무협 설정',
  ]);
});

it('받은 폴더의 묶음별 텍스트 파일을 등록하고, 다시 가져오면 건너뛴다', async () => {
  const store = load();
  const inbox = (await store.materialOverview()).inbox;
  await mkdir(path.join(inbox, '베네수엘라 취재'), { recursive: true });
  await mkdir(path.join(inbox, "bad'name"), { recursive: true });
  await writeFile(path.join(inbox, '베네수엘라 취재', '카라카스.txt'), '알타미라 광장의 저녁.');
  await writeFile(path.join(inbox, '베네수엘라 취재', '메모.MD'), '아레파는 옥수수로 만든다.');
  await writeFile(path.join(inbox, '베네수엘라 취재', '사진.png'), 'binary');
  await writeFile(path.join(inbox, "bad'name", '무시.txt'), '등록하지 않는다.');
  expect(await store.importInbox()).toEqual({ added: 2, skipped: 0 });
  const listed = await store.listCollection('베네수엘라 취재');
  expect(listed.materials.map((material) => material.title).sort()).toEqual(['메모', '카라카스']);
  expect(listed.materials.every((material) => material.role === 'search')).toBe(true);
  expect(await store.importInbox()).toEqual({ added: 0, skipped: 2 });
  await settled(store);
  expect(await readdir(path.join(inbox, '베네수엘라 취재'))).toHaveLength(3);
});
