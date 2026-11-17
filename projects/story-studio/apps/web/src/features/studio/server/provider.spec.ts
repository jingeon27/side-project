import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storeTask } from '../../media/server/assets';
import { sampleProject } from '../../story/model/sample';
import { type TMediaRequest } from '../../story/model/story';
import { generateImage, generatePlan, generateVideo, videoStatus, writeScene } from './provider';

const state = { directory: '' };
const completion = (value: unknown, finish = 'stop') =>
  Response.json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }] });
const project = sampleProject();
const plan = {
  ...project,
  outline: project.scenes.map((scene) => ({ title: scene.title, summary: scene.narration })),
};
const input: TMediaRequest = {
  format: 'animation',
  style: project.brief.style,
  ratio: '16:9',
  quality: 'draft',
  characters: project.characters,
  scene: project.scenes[0]!,
};
beforeEach(async () => {
  vi.stubEnv('STORY_STUDIO_PROVIDER', 'cloud');
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-provider-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  vi.stubEnv('DASHSCOPE_API_KEY', 'test-private-key');
  vi.stubEnv('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(state.directory, { recursive: true, force: true });
});
describe('Qwen·Wan 공식 API 연결', () => {
  it('이야기 구성을 JSON으로 검증하고 사용자 입력을 메시지 데이터로 전달한다', async () => {
    const mock = vi.fn().mockResolvedValue(completion(plan));
    vi.stubGlobal('fetch', mock);
    expect((await generatePlan(project.brief)).title).toBe(project.title);
    const body = JSON.parse(mock.mock.calls[0]![1].body);
    expect(body.model).toBe('qwen3.8-max');
    expect(body.response_format.type).toBe('json_object');
    expect(body.messages[0].content).toContain('한국어');
    expect(JSON.parse(body.messages[1].content).premise).toBe(project.brief.premise);
  });
  it('잘린 응답·잘못된 JSON·요청과 다른 장면 수를 성공으로 취급하지 않는다', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(completion(plan, 'length'))
      .mockResolvedValueOnce(completion({ nonsense: true }))
      .mockResolvedValueOnce(completion({ ...plan, outline: plan.outline.slice(0, 1) }));
    vi.stubGlobal('fetch', mock);
    await expect(generatePlan(project.brief)).rejects.toThrow('끝까지');
    await expect(generatePlan(project.brief)).rejects.toThrow('형식');
    await expect(generatePlan(project.brief)).rejects.toThrow('장면 수');
  });
  it('이어쓰기에 인물 설정과 직전 장면을 포함한다', async () => {
    const mock = vi.fn().mockResolvedValue(completion(project.scenes[0]));
    vi.stubGlobal('fetch', mock);
    expect((await writeScene(project)).title).toBe(project.scenes[0]!.title);
    const body = JSON.parse(mock.mock.calls[0]![1].body);
    const input = JSON.parse(body.messages[1].content);
    expect(input.characters).toContain('노란 우비');
    expect(input.scenes.at(-1).title).toBe('언제나 네 곁에');
    // The cloud writer has no local index: nothing is retrieved and no material rule is added.
    expect(body.messages[0].content).not.toContain('materials');
  });
  it('한국어 시각 묘사를 영어로 번역한 뒤 Qwen Image를 호출하고 원본을 보관한다', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        completion({ prompt: 'A Korean girl in a yellow raincoat, watercolor animation.' }),
      )
      .mockResolvedValueOnce(
        Response.json({
          output: {
            choices: [{ message: { content: [{ image: 'https://result.aliyuncs.com/panel.png' }] } }],
          },
        }),
      )
      .mockResolvedValueOnce(new Response('png-data', { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', mock);
    expect((await generateImage(input)).asset).toMatch(/^\/api\/assets\/.*\.png$/);
    const body = JSON.parse(mock.mock.calls[1]![1].body);
    expect(body.model).toBe('qwen-image-2.0-pro');
    expect(body.input.messages[0].content[0].text).toContain('yellow raincoat');
    expect(body.parameters).toMatchObject({ n: 1, watermark: true, size: '1536*864' });
  });
  it('영상은 비동기 제출 한 번 후 저장된 작업으로 조회하고 성공 파일을 캐시한다', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        completion({ prompt: 'An animated girl walks to a post office. No text or speech.' }),
      )
      .mockResolvedValueOnce(
        Response.json({ output: { task_id: 'video-task-1234', task_status: 'PENDING' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          output: {
            task_id: 'video-task-1234',
            task_status: 'SUCCEEDED',
            video_url: 'https://result.aliyuncs.com/movie.mp4',
          },
        }),
      )
      .mockResolvedValueOnce(new Response('mp4-data', { headers: { 'Content-Type': 'video/mp4' } }));
    vi.stubGlobal('fetch', mock);
    const task = await generateVideo(input);
    expect(mock.mock.calls[1]![1].headers).toMatchObject({ 'X-DashScope-Async': 'enable' });
    expect(JSON.parse(mock.mock.calls[1]![1].body).parameters).toMatchObject({
      ratio: '16:9',
      resolution: '720P',
      duration: 5,
    });
    const [one, two] = await Promise.all([videoStatus(task.id), videoStatus(task.id)]);
    expect(one).toEqual(two);
    expect(one.status).toBe('SUCCEEDED');
    expect(await videoStatus(task.id)).toEqual(one);
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it('만료·실패 영상은 종료 상태로 남기고 사용자에게 실패를 알린다', async () => {
    await storeTask({ id: 'failed-task-1234', status: 'PENDING' });
    const mock = vi
      .fn()
      .mockResolvedValue(Response.json({ output: { task_id: 'failed-task-1234', task_status: 'UNKNOWN' } }));
    vi.stubGlobal('fetch', mock);
    expect(await videoStatus('failed-task-1234')).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('만료'),
    });
    await videoStatus('failed-task-1234');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('완료 응답에 파일이 빠지면 새 영상을 제출하지 않고 상태 재확인을 안내한다', async () => {
    await storeTask({ id: 'missing-url-task', status: 'PENDING' });
    const mock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ output: { task_id: 'missing-url-task', task_status: 'SUCCEEDED' } }),
      );
    vi.stubGlobal('fetch', mock);
    await expect(videoStatus('missing-url-task')).rejects.toThrow('새로 생성하지 말고');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]![1].method).toBe('GET');
  });
  it('서버의 원시 오류나 비밀키를 사용자 오류에 노출하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 'InvalidApiKey', message: 'test-private-key' }, { status: 401 }),
        ),
    );
    await expect(generatePlan(project.brief)).rejects.toThrow('API 키');
    await expect(generatePlan(project.brief)).rejects.not.toThrow('test-private-key');
  });
});
