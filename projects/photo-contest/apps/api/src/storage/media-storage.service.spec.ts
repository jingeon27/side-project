import { afterEach, describe, expect, it, vi } from 'vitest';

import { s3KeyPrefix } from '../config/env';
import { createMediaKey, mediaContentType, MediaStorage, mediaUrlTtlSeconds } from './media-storage.service';

afterEach(() => vi.unstubAllEnvs());

function useSigningConfig(prefix = '') {
  vi.stubEnv('S3_BUCKET', 'unit-signing-only');
  vi.stubEnv('S3_REGION', 'ap-northeast-2');
  vi.stubEnv('S3_ENDPOINT', '');
  vi.stubEnv('S3_FORCE_PATH_STYLE', 'false');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'unit-signing-key');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'unit-signing-secret');
  vi.stubEnv('AWS_SESSION_TOKEN', '');
  vi.stubEnv('S3_KEY_PREFIX', prefix);
}

describe('미디어 저장소 서명 POST', () => {
  it('최종 키·형식·정확한 크기와 티켓보다 늦지 않은 만료를 정책에 서명해야 한다', async () => {
    useSigningConfig('game-feedback/photo-contest');
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
    expect(new URL(form.url).hostname).toBe('unit-signing-only.s3.ap-northeast-2.amazonaws.com');
  });

  it('만료한 티켓과 서버가 만들지 않은 키로는 서명하지 않아야 한다', async () => {
    useSigningConfig();
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

describe('미디어 저장소 서명 GET', () => {
  it.each([
    ['png', '60'],
    ['jpg', '60'],
    ['webp', '60'],
    ['mp4', '600'],
    ['webm', '600'],
  ] as const)('%s 파일은 %s초 동안만 읽을 수 있게 서명해야 한다', async (extension, seconds) => {
    useSigningConfig();
    const key = createMediaKey(extension);
    const url = new URL(await new MediaStorage().presignRead(key));
    expect(url.searchParams.get('X-Amz-Expires')).toBe(seconds);
    expect(String(mediaUrlTtlSeconds(key))).toBe(seconds);
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
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
