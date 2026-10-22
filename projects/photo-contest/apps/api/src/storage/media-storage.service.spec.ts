import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FAKE_S3_DEFAULTS, startFakeS3, type IFakeS3 } from '@photo-contest/test-kit';

import { s3KeyPrefix } from '../config/env';
import { createMediaKey, mediaContentType, MediaStorage } from './media-storage.service';

let directory: string;
let s3: IFakeS3;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'media-storage-'));
  s3 = await startFakeS3({ ...FAKE_S3_DEFAULTS, directory, corsOrigins: [] });
});
afterAll(async () => {
  await s3.stop();
  await rm(directory, { recursive: true, force: true });
});
afterEach(() => vi.unstubAllEnvs());

function useFakeS3(prefix = '') {
  for (const [name, value] of Object.entries(s3.env)) vi.stubEnv(name, value);
  vi.stubEnv('S3_KEY_PREFIX', prefix);
}

async function post(form: { url: string; fields: Record<string, string> }, body: Uint8Array, type: string) {
  const multipart = new FormData();
  for (const [name, value] of Object.entries(form.fields)) multipart.append(name, value);
  multipart.append('file', new Blob([new Uint8Array(body)], { type }), 'media');
  return fetch(form.url, { method: 'POST', body: multipart });
}

describe('미디어 저장소 서명 POST', () => {
  it('최종 키·형식·정확한 크기와 티켓보다 늦지 않은 만료를 정책에 서명하고 HEAD로 확인해야 한다', async () => {
    useFakeS3('game-feedback/photo-contest');
    const storage = new MediaStorage();
    const key = createMediaKey('png');
    expect(key).toMatch(/^game-feedback\/photo-contest\/[a-f0-9-]{36}\.png$/);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const form = await storage.presignUpload(key, 'image/png', 4, expiresAt);
    const policy = JSON.parse(Buffer.from(form.fields.Policy ?? '', 'base64').toString());
    expect(policy.conditions).toEqual(
      expect.arrayContaining([['content-length-range', 4, 4], ['eq', '$Content-Type', 'image/png'], { key }]),
    );
    expect(Date.parse(policy.expiration)).toBeLessThanOrEqual(expiresAt.getTime());
    expect(Date.parse(policy.expiration)).toBeGreaterThan(expiresAt.getTime() - 2_000);
    expect(form.url).toBe(`${s3.endpoint}/${s3.bucket}`);
    await expect(storage.head(key)).rejects.toThrow();
    expect((await post(form, new Uint8Array([1, 2, 3, 4, 5]), 'image/png')).status).toBe(400);
    expect((await post(form, new Uint8Array([1, 2, 3, 4]), 'image/png')).status).toBe(204);
    expect(await storage.head(key)).toEqual({ byteSize: 4, contentType: 'image/png' });
    await storage.delete(key);
    await expect(storage.head(key)).rejects.toThrow();
  });

  it('만료한 티켓과 서버가 만들지 않은 키로는 서명하지 않아야 한다', async () => {
    useFakeS3();
    const storage = new MediaStorage();
    expect(() => storage.presignUpload(createMediaKey('jpg'), 'image/jpeg', 1, new Date())).toThrow();
    for (const key of [
      '../secret.png',
      '/etc/passwd',
      'clip.mp4',
      '00000000-0000-0000-0000-000000000000.svg',
    ])
      expect(() => storage.presignUpload(key, 'image/png', 1, new Date(Date.now() + 60_000))).toThrow(
        'Invalid media key',
      );
    await expect(storage.delete('../secret.png')).rejects.toThrow('Invalid media key');
  });
});

describe('S3 설정', () => {
  it('저장 키의 확장자로 허용한 응답 형식만 정해야 한다', () => {
    expect(mediaContentType('00000000-0000-0000-0000-000000000000.webp')).toBe('image/webp');
    expect(mediaContentType('prefix/00000000-0000-0000-0000-000000000000.mp4')).toBe('video/mp4');
    expect(() => mediaContentType('00000000-0000-0000-0000-000000000000.html')).toThrow();
  });

  it('버킷이 없으면 저장소를 사용하지 않아야 한다', () => {
    vi.stubEnv('S3_BUCKET', '');
    expect(() => new MediaStorage().presignUpload(createMediaKey('png'), 'image/png', 1, new Date())).toThrow(
      'S3_BUCKET',
    );
  });

  it.each(['../other', '/absolute', 'one//two', 's3://bucket', 'one/../../other'])(
    '위험한 prefix %s는 거부해야 한다',
    (prefix) => {
      vi.stubEnv('S3_KEY_PREFIX', prefix);
      expect(() => s3KeyPrefix()).toThrow('S3_KEY_PREFIX');
    },
  );
});
