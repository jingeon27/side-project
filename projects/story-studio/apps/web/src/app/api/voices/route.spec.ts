import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { GET as detail } from './[id]/route';
import { POST as train } from './[id]/train/route';
import { GET, POST } from './route';

const state = { directory: '' };
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'voices-api-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});
function post(body: unknown, origin = 'http://127.0.0.1:3400') {
  return new Request('http://127.0.0.1:3400/api/voices', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
it('외부 사이트에서 녹음 이름이나 학습 데이터를 읽고 생성하지 못한다', async () => {
  expect((await GET(new Request('http://evil.example/api/voices'))).status).toBe(403);
  expect((await POST(post({ name: '목소리' }, 'http://evil.example'))).status).toBe(403);
  const response = await POST(post({ name: '한글 목소리' }));
  expect(response.status).toBe(201);
  const voice = await response.json();
  const local = new Request('http://127.0.0.1:3400/api/voices');
  expect((await GET(local)).headers.get('cache-control')).toBe('no-store');
  expect((await detail(local, { params: Promise.resolve({ id: voice.id }) })).status).toBe(200);
  expect(
    (await detail(new Request('http://evil.example/'), { params: Promise.resolve({ id: voice.id }) })).status,
  ).toBe(403);
});
it('잘못된 ID와 학습 횟수는 파일 조회나 모델 로딩 전에 거부한다', async () => {
  expect(
    (
      await detail(new Request('http://127.0.0.1:3400/api/voices'), {
        params: Promise.resolve({ id: '../local' }),
      })
    ).status,
  ).toBe(400);
  expect(
    (await train(post({ epochs: 21 }), { params: Promise.resolve({ id: crypto.randomUUID() }) })).status,
  ).toBe(400);
});
