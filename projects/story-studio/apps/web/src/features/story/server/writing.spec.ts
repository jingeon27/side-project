import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { StudioError } from '../../../shared/server/errors';
import { listProjects, readProject, saveProject } from '../../library/server/project-store';
import { sampleProject } from '../model/sample';
import type { TContinueRequest } from '../model/story';
import { activeWriting, cancelWriting, continueStory, startStory, writingStatus } from './writing';

const writer = vi.hoisted(() => ({ plan: vi.fn(), scene: vi.fn() }));
const worker = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), local: true }));
vi.mock('./writer', () => ({ generatePlan: writer.plan, writeScene: writer.scene }));
vi.mock('../../../shared/server/local-worker', () => ({
  isLocalMode: () => worker.local,
  openLocalSession: worker.open,
}));
const state = { directory: '' };
const sample = sampleProject();
const outline = ['첫 장', '둘째 장', '셋째 장'].map((title) => ({ title, summary: `${title}의 사건` }));
const plan = {
  title: sample.title,
  logline: sample.logline,
  synopsis: sample.synopsis,
  characters: sample.characters,
};
const session = { send: vi.fn(), close: worker.close };
function sceneFor(input: TContinueRequest) {
  return {
    ...sample.scenes[0]!,
    id: undefined,
    title: input.beat?.title ?? '자유롭게 이은 장',
    narration: '본문',
  };
}
async function finished(id: string) {
  await vi.waitFor(() => expect(writingStatus(id).status).not.toBe('RUNNING'));
  return writingStatus(id);
}
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-writing-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  worker.local = true;
  worker.open.mockReset().mockResolvedValue(session);
  worker.close.mockReset().mockResolvedValue(undefined);
  writer.plan.mockReset().mockResolvedValue({ ...plan, outline });
  writer.scene.mockReset().mockImplementation(async (input: TContinueRequest) => sceneFor(input));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('구성한 뒤 장면을 하나씩 써서 작품에 저장하고, 모델은 한 번만 불러온다', async () => {
  const started = startStory(sample.brief);
  expect(started).toMatchObject({ status: 'RUNNING', scenes: 0 });
  expect(activeWriting().map((job) => job.id)).toContain(started.id);
  const done = await finished(started.id);
  expect(done).toMatchObject({ status: 'SUCCEEDED', scenes: 3 });
  const project = await readProject(done.projectId!);
  expect(project.scenes.map((scene) => scene.title)).toEqual(['첫 장', '둘째 장', '셋째 장']);
  expect(project.outline).toBeUndefined();
  expect(worker.open).toHaveBeenCalledTimes(1);
  expect(worker.close).toHaveBeenCalledTimes(1);
  // Every request goes through the one open session, and each scene sees what was written before it.
  expect(writer.plan.mock.calls[0]?.[2]).toBe(session);
  const requests = writer.scene.mock.calls.map((call) => call[0] as TContinueRequest);
  expect(requests.map((request) => request.scenes.length)).toEqual([0, 1, 2]);
  expect(requests.map((request) => request.upcoming?.length)).toEqual([2, 1, 0]);
  expect(writer.scene.mock.calls.every((call) => call[2] === session)).toBe(true);
  expect(activeWriting()).toEqual([]);
});

it('중간에 실패하면 쓴 장면과 남은 구성을 보존하고, 이어 쓰기가 남은 구성부터 쓴다', async () => {
  writer.scene
    .mockImplementationOnce(async (input: TContinueRequest) => sceneFor(input))
    .mockImplementationOnce(async () => {
      throw new StudioError('로컬 모델이 원고 형식을 지키지 못했습니다. 분량을 줄여 다시 시도해 주세요.');
    });
  const failed = await finished(startStory(sample.brief).id);
  expect(failed).toMatchObject({ status: 'FAILED', scenes: 1 });
  expect(failed.error).toContain('원고 형식');
  expect(worker.close).toHaveBeenCalledTimes(1);
  const kept = await readProject(failed.projectId!);
  expect(kept.scenes.map((scene) => scene.title)).toEqual(['첫 장']);
  expect(kept.outline?.map((beat) => beat.title)).toEqual(['둘째 장', '셋째 장']);
  const resumed = await finished((await continueStory(kept.id)).id);
  expect(resumed).toMatchObject({ status: 'SUCCEEDED', scenes: 2, projectId: kept.id });
  const next = await readProject(kept.id);
  expect(next.scenes.map((scene) => scene.title)).toEqual(['첫 장', '둘째 장']);
  expect(next.outline?.map((beat) => beat.title)).toEqual(['셋째 장']);
  expect(next.updatedAt >= kept.updatedAt).toBe(true);
});

it('구성을 다 쓴 작품은 구성 없이 이어 쓰고, 없는 작품의 이어 쓰기는 시작하지 않는다', async () => {
  await saveProject(sample, null);
  const done = await finished((await continueStory(sample.id)).id);
  expect(done).toMatchObject({ status: 'SUCCEEDED', scenes: sample.scenes.length + 1 });
  const request = writer.scene.mock.calls[0]?.[0] as TContinueRequest;
  expect(request.beat).toBeUndefined();
  expect((await readProject(sample.id)).scenes.at(-1)?.title).toBe('자유롭게 이은 장');
  await expect(continueStory(crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
  expect(worker.open).toHaveBeenCalledTimes(1);
});

it('중단하면 쓰던 장면을 버리고 저장한 장면만 남긴 채 세션을 닫는다', async () => {
  const second = Promise.withResolvers<never>();
  writer.scene
    .mockImplementationOnce(async (input: TContinueRequest) => sceneFor(input))
    .mockImplementationOnce((_input: TContinueRequest, signal: AbortSignal) => {
      signal.addEventListener('abort', () => second.reject(new DOMException('중단했습니다.', 'AbortError')));
      return second.promise;
    });
  const started = startStory(sample.brief);
  await vi.waitFor(() => expect(writingStatus(started.id).scenes).toBe(1));
  expect(cancelWriting(started.id).id).toBe(started.id);
  const stopped = await finished(started.id);
  expect(stopped).toMatchObject({ status: 'CANCELLED', scenes: 1 });
  expect(stopped.error).toContain('중단');
  expect((await listProjects()).projects).toHaveLength(1);
  expect(worker.close).toHaveBeenCalledTimes(1);
  expect(() => writingStatus(crypto.randomUUID())).toThrow('집필 작업');
});

it('로컬 모델이 바쁘면 세션을 열지 못한 사유로 끝나고, 클라우드 연결에서는 세션 없이 쓴다', async () => {
  worker.open.mockRejectedValueOnce(
    new StudioError('다른 로컬 생성 작업이 실행 중입니다. 현재 작업이 끝난 뒤 다시 시도해 주세요.', 409),
  );
  const busy = await finished(startStory(sample.brief).id);
  expect(busy).toMatchObject({ status: 'FAILED', scenes: 0 });
  expect(busy.error).toContain('다른 로컬 생성 작업');
  expect(writer.plan).not.toHaveBeenCalled();
  worker.local = false;
  const cloud = await finished(startStory(sample.brief).id);
  expect(cloud).toMatchObject({ status: 'SUCCEEDED', scenes: 3 });
  expect(worker.open).toHaveBeenCalledTimes(1);
  expect(writer.plan.mock.calls[0]?.[2]).toBeUndefined();
});
