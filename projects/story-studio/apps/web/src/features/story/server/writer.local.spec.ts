import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sampleProject } from '../model/sample';
import { generatePlan, writeScene } from './writer';

const worker = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../../shared/server/local-worker', () => ({
  isLocalMode: () => true,
  localConfiguration: () => ({ provider: 'local', videoReady: true }),
  runLocal: worker.run,
}));
const state = { directory: '' };
const project = sampleProject();
const outline = project.scenes.map((scene) => ({ title: scene.title, summary: scene.narration }));
const plan = { ...project, outline };
const written = (output: unknown, sources: string[] = []) => ({ output, sources });
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'studio-local-provider-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  vi.stubEnv('DASHSCOPE_API_KEY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('External network is forbidden');
    }),
  );
  worker.run.mockReset();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(state.directory, { recursive: true, force: true });
});

it('이야기 구성을 장면 수만큼의 항목으로 제한한 로컬 JSON 스키마로 만들고 외부 연결 없이 검증한다', async () => {
  worker.run.mockResolvedValue(written(plan));
  expect((await generatePlan(project.brief)).outline).toEqual(outline);
  const request = worker.run.mock.calls[0]?.[0];
  expect(request).toMatchObject({ action: 'text', system: expect.stringContaining('구성 단계') });
  expect(request.schema.properties.outline).toMatchObject({ minItems: 3, maxItems: 3 });
  expect(request.retrieval).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it('로컬 모델도 잘못된 형식이나 장면 수를 성공으로 취급하지 않는다', async () => {
  worker.run
    .mockResolvedValueOnce(written({ bad: true }))
    .mockResolvedValueOnce({ ...plan })
    .mockResolvedValueOnce(written({ ...plan, outline: outline.slice(0, 1) }));
  await expect(generatePlan(project.brief)).rejects.toThrow('형식');
  await expect(generatePlan(project.brief)).rejects.toThrow('형식');
  await expect(generatePlan(project.brief)).rejects.toThrow('장면 수');
});

it('장면 하나를 쓸 때 지금 쓸 항목과 뒤따를 항목, 직전 원고만 넘긴다', async () => {
  const scene = project.scenes[1]!;
  worker.run.mockResolvedValue(written(scene));
  const result = await writeScene({
    brief: project.brief,
    title: project.title,
    synopsis: project.synopsis,
    characters: project.characters,
    scenes: [project.scenes[0]!],
    beat: outline[1],
    upcoming: [outline[2]!],
  });
  expect(result).toMatchObject({ title: scene.title, narration: scene.narration });
  expect(result).not.toHaveProperty('sources');
  const request = worker.run.mock.calls[0]?.[0];
  expect(request.system).toContain('집필 단계');
  expect(request.input).toMatchObject({ beat: outline[1], upcoming: [outline[2]] });
  expect(request.input.scenes).toHaveLength(1);
  expect(request.retrieval).toBeUndefined();
});

it('참고 자료 묶음을 고른 작품만 검색을 요청하고 쓴 자료의 제목을 장면에 남긴다', async () => {
  const brief = { ...project.brief, collections: ['무협 설정'] };
  worker.run
    .mockResolvedValueOnce(written(plan, ['강호 용어집']))
    .mockResolvedValueOnce(written(project.scenes[0], ['강호 용어집', '객잔 묘사']));
  await generatePlan(brief);
  const scene = await writeScene({
    brief,
    title: project.title,
    synopsis: project.synopsis,
    characters: project.characters,
    scenes: [],
    beat: outline[0],
    upcoming: outline.slice(1),
  });
  const [planning, writing] = worker.run.mock.calls.map((call) => call[0]);
  expect(planning.retrieval).toEqual({
    collections: ['무협 설정'],
    query: expect.stringContaining(project.brief.premise),
  });
  expect(planning.system).toContain('materials');
  expect(writing.retrieval).toEqual({
    collections: ['무협 설정'],
    query: expect.stringContaining(outline[0]!.summary),
  });
  // Collection names choose what to search; the writer never reads them as story material.
  expect(JSON.stringify(writing.input)).not.toContain('무협 설정');
  expect(scene.sources).toEqual(['강호 용어집', '객잔 묘사']);
});
