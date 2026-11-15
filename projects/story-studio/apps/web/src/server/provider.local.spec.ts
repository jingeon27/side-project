import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sampleProject } from '../lib/sample';
import { storeTask } from './assets';
import { generateDraft, generateImage, generateVoice, videoStatus } from './provider';

const worker = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./local-worker', () => ({
  isLocalMode: () => true,
  localConfiguration: () => ({ provider: 'local', videoReady: true }),
  runLocal: worker.run,
}));
const state = { directory: '' };
const project = sampleProject();
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

it('한국어 원고를 로컬 JSON 스키마로 생성하고 외부 연결 없이 검증한다', async () => {
  worker.run.mockResolvedValue(project);
  expect((await generateDraft(project.brief)).title).toBe(project.title);
  expect(worker.run).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'text',
      system: expect.stringContaining('한국어'),
      schema: expect.any(Object),
    }),
    undefined,
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('로컬 모델도 잘못된 형식이나 장면 수를 성공으로 취급하지 않는다', async () => {
  worker.run
    .mockResolvedValueOnce({ bad: true })
    .mockResolvedValueOnce({ ...project, scenes: [project.scenes[0]] });
  await expect(generateDraft(project.brief)).rejects.toThrow('형식');
  await expect(generateDraft(project.brief)).rejects.toThrow('장면 수');
});

it('장면 번역과 이미지 생성을 순차 실행하며 선택한 낮은 부하 설정을 전달한다', async () => {
  const asset = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
  worker.run
    .mockResolvedValueOnce({ prompt: 'A hand-painted animated girl in a yellow raincoat' })
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
