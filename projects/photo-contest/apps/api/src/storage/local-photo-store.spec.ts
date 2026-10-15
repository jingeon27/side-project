import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalPhotoStore } from './local-photo-store';
import { createMediaKey, MediaStorage } from './media-storage.service';

async function readStream(stream: Awaited<ReturnType<LocalPhotoStore['stream']>>) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

describe('비공개 미디어 저장소', () => {
  it('개인 파일 권한을 유지하고 파일 전체와 요청한 구간을 스트리밍해야 한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gallery-media-'));
    try {
      const store = new LocalPhotoStore(directory);
      await store.put('clip.mp4', Buffer.from('0123456789'));
      expect((await stat(join(directory, 'clip.mp4'))).mode & 0o777).toBe(0o600);
      expect(await readStream(await store.stream('clip.mp4'))).toBe('0123456789');
      expect(await readStream(await store.stream('clip.mp4', { start: 2, end: 5 }))).toBe('2345');
      await store.delete('clip.mp4');
      await store.delete('clip.mp4');
      await expect(store.get('clip.mp4')).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('클라이언트가 저장 경로와 확장자를 조작할 수 없어야 한다', () => {
    const storage = new MediaStorage();
    for (const key of ['../secret.mp4', '/etc/passwd', 'clip.mp4', '123.svg'])
      expect(() => storage.stream(key)).toThrow('Invalid media key');
    expect(createMediaKey('mp4')).toMatch(/^[a-f0-9-]{36}\.mp4$/);
  });
});
