import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_UPLOAD_ORPHAN_TTL_MS } from '../config/limits';
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

describe('로컬 업로드 수명 주기', () => {
  let directory: string;
  const now = new Date();
  const old = new Date(now.getTime() - LOCAL_UPLOAD_ORPHAN_TTL_MS - 1000);
  const createFile = async (name: string, modifiedAt = old) => {
    const path = join(directory, name);
    await writeFile(path, 'private');
    await utimes(path, modifiedAt, modifiedAt);
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gallery-upload-cleanup-'));
    await mkdir(join(directory, 'staging'));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it('1일 지난 staging·타입 정보·임시 업로드만 지우고 최근 업로드와 게시 파일은 보존해야 한다', async () => {
    const abandoned = randomUUID();
    const recent = randomUUID();
    const temporary = `.${randomUUID()}.upload`;
    const published = `${randomUUID()}.jpg`;
    await createFile(`staging/${abandoned}`);
    await createFile(`staging/${abandoned}.type`);
    await createFile(temporary);
    await createFile(`staging/${recent}`, now);
    await createFile(`staging/${recent}.type`, now);
    await createFile(published);
    await createFile('staging/not-an-upload');
    await createFile('.not-a-uuid.upload');

    expect(await new LocalPhotoStore(directory).pruneAbandoned(now, 100)).toBe(3);
    expect((await readdir(join(directory, 'staging'))).sort()).toEqual(
      [`${recent}`, `${recent}.type`, 'not-an-upload'].sort(),
    );
    expect(await readFile(join(directory, published), 'utf8')).toBe('private');
    expect(await readFile(join(directory, '.not-a-uuid.upload'), 'utf8')).toBe('private');
  });

  it('staging과 루트의 전체 삭제 수를 한 배치 한도 안에 두고 다음 실행에서 이어 정리해야 한다', async () => {
    for (let index = 0; index < 2; index++) {
      await createFile(`staging/${randomUUID()}`);
      await createFile(`.${randomUUID()}.upload`);
    }
    const store = new LocalPhotoStore(directory);
    expect(await store.pruneAbandoned(now, 3)).toBe(3);
    const remaining = [
      ...(await readdir(join(directory, 'staging'))),
      ...(await readdir(directory)).filter((name) => name.endsWith('.upload')),
    ];
    expect(remaining).toHaveLength(1);
    expect(await store.pruneAbandoned(now, 3)).toBe(1);
    expect(await store.pruneAbandoned(now, 3)).toBe(0);
  });

  it('정확한 업로드 이름이어도 심볼릭 링크와 디렉터리를 따라가거나 삭제하지 않아야 한다', async () => {
    await createFile('protected');
    const staged = randomUUID();
    await symlink(join(directory, 'protected'), join(directory, 'staging', staged));
    await mkdir(join(directory, 'staging', randomUUID()));
    await symlink(join(directory, 'protected'), join(directory, `.${randomUUID()}.upload`));
    expect(await new LocalPhotoStore(directory).pruneAbandoned(now, 100)).toBe(0);
    expect(await readFile(join(directory, 'protected'), 'utf8')).toBe('private');

    const outside = await mkdtemp(join(tmpdir(), 'gallery-cleanup-protected-'));
    try {
      const outsideFile = join(outside, randomUUID());
      await writeFile(outsideFile, 'outside');
      await utimes(outsideFile, old, old);
      await rm(join(directory, 'staging'), { recursive: true });
      await symlink(outside, join(directory, 'staging'));
      expect(await new LocalPhotoStore(directory).pruneAbandoned(now, 100)).toBe(0);
      expect(await readFile(outsideFile, 'utf8')).toBe('outside');
      await symlink(outside, join(directory, 'root-link'));
      expect(await new LocalPhotoStore(join(directory, 'root-link')).pruneAbandoned(now, 100)).toBe(0);
      expect(await readFile(outsideFile, 'utf8')).toBe('outside');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('S3 backend이거나 저장 폴더가 없으면 로컬 파일 정리를 실행하지 않아야 한다', async () => {
    const key = randomUUID();
    await createFile(`staging/${key}`);
    vi.stubEnv('STORAGE_BACKEND', 's3');
    vi.stubEnv('STORAGE_DIR', directory);
    await new MediaStorage().pruneAbandoned(now);
    expect(await readFile(join(directory, 'staging', key), 'utf8')).toBe('private');
    expect(await new LocalPhotoStore(join(directory, 'missing')).pruneAbandoned(now, 100)).toBe(0);
    expect(await new LocalPhotoStore(directory).pruneAbandoned(now, 0)).toBe(0);
  });
});
