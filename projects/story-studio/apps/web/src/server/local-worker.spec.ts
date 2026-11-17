import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { dataPath, readTask, storeTask } from './assets';
import { cancelLocalVideo, isLocalMode, localConfiguration, localWorkerBusy, runLocal } from './local-worker';

const state = { directory: '' };
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-worker-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
  vi.stubEnv('STORY_STUDIO_PROVIDER', '');
  vi.stubEnv('DASHSCOPE_API_KEY', 'must-not-reach-a-local-worker');
  await mkdir(dataPath('local', '.venv', 'bin'), { recursive: true });
  for (const model of [
    'text-gemma-4-31b-it-4bit',
    'voice',
    'video-wan2.2-ti2v-5b',
    'image-flux2-klein-4b-q8',
  ])
    await mkdir(dataPath('local', 'models', model), { recursive: true });
  await writeFile(
    dataPath('local', 'models', 'text-gemma-4-31b-it-4bit', 'model.safetensors.index.json'),
    '{}',
  );
  await writeFile(dataPath('local', 'models', 'voice', 'model.safetensors'), 'fixture');
  await writeFile(dataPath('local', 'models', 'video-wan2.2-ti2v-5b', 'ready.json'), '{}');
  await writeFile(dataPath('local', 'models', 'image-flux2-klein-4b-q8', 'ready.json'), '{}');
  const shim = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[process.argv.indexOf('--data-dir') + 1];
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  fs.appendFileSync(path.join(root, 'started.log'), input.action + '\\n');
  if (input.taskId) fs.writeFileSync(path.join(root, 'local/active.json'), JSON.stringify({ pid: process.pid, taskId: input.taskId }));
  console.log(JSON.stringify({ progress: 'started' }));
  if (input.text === 'fail') return process.exit(2);
  setTimeout(() => {
    console.log(JSON.stringify({ result: { offline: process.env.HF_HUB_OFFLINE, threads: process.env.OMP_NUM_THREADS, module: process.argv.slice(2, 4), source: process.env.PYTHONPATH, examples: process.argv[process.argv.indexOf('--examples-dir') + 1], key: process.env.DASHSCOPE_API_KEY } }));
  }, input.text === 'slow' ? 30000 : 30);
});
`;
  await writeFile(dataPath('local', '.venv', 'bin', 'python'), shim);
  await chmod(dataPath('local', '.venv', 'bin', 'python'), 0o700);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('설정 없이 로컬 모드를 고르고 키를 전달하지 않으며 오프라인·스레드 제한을 적용한다', async () => {
  expect(isLocalMode()).toBe(true);
  expect(localConfiguration()).toMatchObject({
    provider: 'local',
    textReady: true,
    videoReady: true,
    voiceReady: true,
  });
  expect(await runLocal({ action: 'voice', text: '안녕하세요' })).toEqual({
    offline: '1',
    threads: '2',
    module: ['-m', 'story_studio'],
    source: path.resolve(process.cwd(), '../engine/src'),
    examples: path.join(process.cwd(), 'public/examples'),
  });
});

it('이미지와 영상 모델을 따로 확인하고 이전 Wan2.1 설치나 변환 전 원본은 준비로 보지 않는다', async () => {
  await rm(dataPath('local', 'models', 'video-wan2.2-ti2v-5b'), { recursive: true });
  await mkdir(dataPath('local', 'models', 'video'), { recursive: true });
  await writeFile(dataPath('local', 'models', 'video', 'ready.json'), '{}');
  expect(localConfiguration()).toMatchObject({ imageReady: true, videoReady: false });
  await expect(runLocal({ action: 'video', prompt: 'x' })).rejects.toMatchObject({ status: 503 });
  await expect(runLocal({ action: 'image', text: '이미지' })).resolves.toBeDefined();
  await rm(dataPath('local', 'models', 'image-flux2-klein-4b-q8'), { recursive: true });
  await mkdir(dataPath('local', 'models', 'image', 'transformer'), { recursive: true });
  await writeFile(dataPath('local', 'models', 'image', 'model_index.json'), '{}');
  expect(localConfiguration().imageReady).toBe(false);
});

it('동시에 들어온 생성 요청을 모델 로딩 전에 거절하고 완료 후 다시 실행한다', async () => {
  const first = runLocal({ action: 'voice', text: 'first' });
  await expect(runLocal({ action: 'text' })).rejects.toMatchObject({ status: 409 });
  await first;
  expect((await readFile(dataPath('started.log'), 'utf8')).trim()).toBe('voice');
  expect(localWorkerBusy()).toBe(false);
  await expect(runLocal({ action: 'voice', text: 'retry' })).resolves.toBeDefined();
});

it('중단된 요청은 자식 프로세스와 실행 잠금을 정리한다', async () => {
  const controller = new AbortController();
  const job = runLocal({ action: 'voice', text: 'slow' }, controller.signal, () => controller.abort());
  await expect(job).rejects.toMatchObject({ name: 'AbortError' });
  expect(localWorkerBusy()).toBe(false);
  await expect(runLocal({ action: 'voice', text: 'retry' })).resolves.toBeDefined();
});

it('실패 후 잠금을 해제하고 로컬 로그 위치로 복구를 안내한다', async () => {
  await expect(runLocal({ action: 'voice', text: 'fail' })).rejects.toThrow('로컬 로그');
  expect(localWorkerBusy()).toBe(false);
  await expect(runLocal({ action: 'voice', text: 'retry' })).resolves.toBeDefined();
});

it('실제 스튜디오 자식 프로세스만 중단하고 종료 상태를 보관한다', async () => {
  const id = `local-${crypto.randomUUID()}`;
  await storeTask({ id, status: 'RUNNING' });
  const ready = Promise.withResolvers<void>();
  const job = runLocal({ action: 'video', taskId: id, text: 'slow' }, undefined, () => ready.resolve());
  const ended = expect(job).rejects.toThrow();
  await ready.promise;
  expect((await cancelLocalVideo(id)).status).toBe('FAILED');
  expect(localWorkerBusy()).toBe(false);
  await ended;
  expect((await readTask(id)).error).toContain('사용자가');
  await expect(cancelLocalVideo('cloud-task-1234')).rejects.toMatchObject({ status: 400 });
});
