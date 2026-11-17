import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleProject } from '../model/sample';
import { generatePlan, writeScene } from './writer';

const state = { directory: '' };
const completion = (value: unknown, finish = 'stop') =>
  Response.json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }] });
const project = sampleProject();
const plan = {
  ...project,
  outline: project.scenes.map((scene) => ({ title: scene.title, summary: scene.narration })),
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
describe('클라우드 원고 모델 연결', () => {
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
