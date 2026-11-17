import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleProject } from '../../../lib/sample';
import { GET, POST } from './route';

beforeEach(() => {
  vi.stubEnv('STORY_STUDIO_PROVIDER', 'cloud');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const post = (body: unknown, origin = 'http://127.0.0.1:3400') =>
  new Request('http://127.0.0.1:3400/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
describe('로컬 창작 API 경계', () => {
  it('키 없이 연결 상태만 공개하며 비밀키를 포함하지 않는다', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'private-secret');
    const response = await GET(new Request('http://127.0.0.1:3400/api/studio'));
    const body = await response.json();
    expect(body.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('private-secret');
  });
  it('외부 사이트의 유료 생성 요청과 비로컬 호스트를 거부한다', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect(
      (await POST(post({ action: 'plan', input: sampleProject().brief }, 'https://evil.example'))).status,
    ).toBe(403);
    expect((await GET(new Request('http://public.example/api/studio'))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('키가 없으면 생성했다고 가장하지 않고 연결 필요 오류를 반환한다', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', '');
    const response = await POST(post({ action: 'plan', input: sampleProject().brief }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('AI 연결');
  });
  it('잘못된 입력과 너무 큰 요청을 유료 호출 전에 거부한다', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await POST(post({ action: 'plan', input: {} }))).status).toBe(400);
    expect((await POST(post({ value: '가'.repeat(510000) }))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
});
