import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assetResponse,
  dataPath,
  readTask,
  saveAsset,
  saveImage,
  storeTask,
  trustedAssetUrl,
} from './assets';

const state = { directory: '' };
const filename = '12345678-1234-1234-1234-123456789abc.mp4';
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-assets-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(state.directory, { recursive: true, force: true });
});
describe('생성 자산 격리와 영상 재생', () => {
  it('가져온 이미지는 PNG만 저장하고 기존 자산 주소로 다시 읽는다', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(200, 7),
    ]);
    const asset = await saveImage(png);
    expect(asset).toMatch(/^\/api\/assets\/[a-f0-9-]{36}\.png$/);
    const response = await assetResponse(path.basename(asset), null);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
    await expect(saveImage(Buffer.from('<svg onload="alert(1)"></svg>'.padEnd(200)))).rejects.toMatchObject({
      status: 400,
    });
    await expect(saveImage(png.subarray(0, 20))).rejects.toMatchObject({ status: 400 });
  });
  it('HTTPS Alibaba 자산만 저장하며 로컬 주소·유사 도메인·인증정보를 거부한다', () => {
    expect(trustedAssetUrl('https://result.oss-ap-southeast-1.aliyuncs.com/image.png').protocol).toBe(
      'https:',
    );
    for (const url of [
      'http://result.aliyuncs.com/a',
      'https://127.0.0.1/a',
      'https://aliyuncs.com.evil.com/a',
      'https://user:pass@a.aliyuncs.com/a',
      'https://a.aliyuncs.com:8080/a',
    ]) {
      expect(() => trustedAssetUrl(url)).toThrow();
    }
  });
  it('생성 URL 만료와 무관하게 파일을 저장하고 전체·부분·suffix 재생을 지원한다', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response('abcdefghij', { headers: { 'Content-Type': 'video/mp4' } }));
    vi.stubGlobal('fetch', mock);
    const asset = await saveAsset('https://result.aliyuncs.com/video.mp4?Expires=123', 'mp4');
    const saved = asset.split('/').at(-1)!;
    expect(await (await assetResponse(saved, null)).text()).toBe('abcdefghij');
    const range = await assetResponse(saved, 'bytes=2-5');
    expect(range.status).toBe(206);
    expect(range.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await range.text()).toBe('cdef');
    expect(await (await assetResponse(saved, 'bytes=-3')).text()).toBe('hij');
    expect((await assetResponse(saved, 'bytes=10-')).status).toBe(416);
    expect((await assetResponse(saved, 'bytes=8-2')).status).toBe(416);
    expect((await assetResponse(saved, 'bytes=-')).status).toBe(416);
    expect(mock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error' }));
  });
  it('경로 이탈과 알 수 없는 작업을 차단하고 작업 상태를 재시작 후에도 읽는다', async () => {
    await expect(assetResponse('../../.env.local', null)).rejects.toMatchObject({ status: 404 });
    await expect(readTask('../secret')).rejects.toMatchObject({ status: 400 });
    await expect(readTask('unknown-task-1234')).rejects.toMatchObject({ status: 404 });
    const task = { id: 'owned-task-1234', status: 'RUNNING' as const };
    await storeTask(task);
    expect(await readTask(task.id)).toEqual(task);
  });
  it('비미디어 응답은 파일로 저장하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } })),
    );
    await expect(saveAsset('https://result.aliyuncs.com/a.png', 'png')).rejects.toThrow();
  });
  it('존재하지 않는 파일을 명확하게 알린다', async () => {
    await mkdir(dataPath('assets'), { recursive: true });
    await writeFile(dataPath('assets', filename), 'a');
    expect((await assetResponse(filename, null)).status).toBe(200);
    await expect(assetResponse(filename.replace('12345678', '00000000'), null)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('모델이 없는 설치에서도 함께 제공한 실제 예시 영상을 범위 재생한다', async () => {
    const response = await assetResponse('73bee1e7-75c0-4cb8-809a-1a99f2976cd2.mp4', 'bytes=0-15');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect((await response.arrayBuffer()).byteLength).toBe(16);
  });
  it('프로세스가 사라진 로컬 작업은 계속 실행 중으로 남기지 않는다', async () => {
    const id = `local-${crypto.randomUUID()}`;
    await mkdir(dataPath('tasks'), { recursive: true });
    await writeFile(
      dataPath('tasks', `${id}.json`),
      JSON.stringify({ id, status: 'RUNNING', ownerPid: 2147483647 }),
    );
    expect(await readTask(id)).toMatchObject({ status: 'FAILED', error: expect.stringContaining('종료') });
    expect((await readTask(id)).status).toBe('FAILED');
  });
});
