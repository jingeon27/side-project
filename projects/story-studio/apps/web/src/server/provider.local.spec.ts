import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sampleProject } from '../lib/sample';
import { readTask, storeTask } from './assets';
import {
  generateImage,
  generatePlan,
  generateVideo,
  generateVoice,
  videoStatus,
  writeScene,
} from './provider';

const worker = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./local-worker', () => ({
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

it('장면 번역과 이미지 생성을 순차 실행하며 선택한 낮은 부하 설정을 전달한다', async () => {
  const asset = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
  worker.run
    .mockResolvedValueOnce(written({ prompt: 'A hand-painted animated girl in a yellow raincoat' }))
    .mockResolvedValueOnce({ asset });
  const scene = project.scenes[0]!;
  expect(
    await generateImage({
      format: 'animation',
      style: project.brief.style,
      characters: project.characters,
      ratio: '16:9',
      quality: 'draft',
      scene,
    }),
  ).toEqual({ asset });
  expect(worker.run.mock.calls[1]?.[0]).toMatchObject({ action: 'image', quality: 'draft', ratio: '16:9' });
  expect(fetch).not.toHaveBeenCalled();
});

it('인물 기준 이미지는 로컬 이미지 모델에만 넘기고 원고 번역 입력에는 넣지 않는다', async () => {
  const reference = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
  worker.run
    .mockResolvedValueOnce(written({ prompt: 'A man in his sixties at a market in Caracas' }))
    .mockResolvedValueOnce({ asset: '/api/assets/12345678-1234-1234-1234-123456789abd.png' });
  await generateImage({
    format: 'drama',
    style: project.brief.style,
    characters: project.characters,
    ratio: '16:9',
    quality: 'draft',
    scene: project.scenes[1]!,
    reference,
  });
  expect(JSON.stringify(worker.run.mock.calls[0]?.[0])).not.toContain(reference);
  expect(worker.run.mock.calls[1]?.[0]).toMatchObject({ action: 'image', reference });
});

it('장면 이미지가 있으면 그 이미지를 첫 프레임으로 넘기고 움직임만 묘사하게 한다', async () => {
  const image = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
  const asset = '/api/assets/12345678-1234-1234-1234-123456789abd.mp4';
  worker.run
    .mockResolvedValueOnce(written({ prompt: 'He turns toward the sea as the camera slowly pushes in' }))
    .mockResolvedValueOnce({ asset });
  const task = await generateVideo({
    format: 'drama',
    style: project.brief.style,
    characters: project.characters,
    ratio: '16:9',
    quality: 'draft',
    scene: project.scenes[0]!,
    image,
  });
  expect(worker.run.mock.calls[0]?.[0]).toMatchObject({ system: expect.stringContaining('first frame') });
  expect(JSON.stringify(worker.run.mock.calls[0]?.[0])).not.toContain(image);
  expect(worker.run.mock.calls[1]?.[0]).toMatchObject({ action: 'video', image, taskId: task.id });
  await vi.waitFor(async () => expect(await readTask(task.id)).toMatchObject({ status: 'SUCCEEDED', asset }));
});

it('한국어 음성과 저장된 로컬 영상 상태는 API 키 없이 처리한다', async () => {
  worker.run.mockResolvedValue({
    asset: '/api/assets/12345678-1234-1234-1234-123456789abc.wav',
    duration: 3.2,
  });
  expect((await generateVoice('고양이가 별을 안았어요')).duration).toBe(3.2);
  const id = `local-${crypto.randomUUID()}`;
  await storeTask({ id, status: 'RUNNING', progress: '생성 중' });
  expect((await videoStatus(id)).status).toBe('RUNNING');
  expect(fetch).not.toHaveBeenCalled();
});
