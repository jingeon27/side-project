import { afterEach, describe, expect, it, vi } from 'vitest';
import { s3KeyPrefix } from '../config/env';
import { assertPhotoKey } from './photo-key';
import { createMediaKey, createStagingKey, MediaStorage } from './media-storage.service';

afterEach(() => vi.unstubAllEnvs());
describe('S3 객체 경로', () => {
  it('공유 버킷의 제한된 prefix 안에 staging과 최종 객체를 만들고 실제 POST 정책에도 반영해야 한다', async () => {
    vi.stubEnv('STORAGE_BACKEND', 's3');
    vi.stubEnv('S3_BUCKET', 'test-bucket');
    vi.stubEnv('S3_REGION', 'ap-northeast-2');
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_KEY_PREFIX', 'game-feedback/photo-contest/');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');
    const staging = createStagingKey();
    const final = createMediaKey('webp');
    expect(staging).toMatch(/^game-feedback\/photo-contest\/staging\/[a-f0-9-]{36}$/);
    expect(final).toMatch(/^game-feedback\/photo-contest\/[a-f0-9-]{36}\.webp$/);
    expect(assertPhotoKey(final)).toBe(final);
    const form = await new MediaStorage().presignUpload(
      staging,
      'image/png',
      100,
      new Date(Date.now() + 300_000),
    );
    expect(form.fields.key).toBe(staging);
    expect(assertPhotoKey('00000000-0000-0000-0000-000000000000.webp')).toBe(
      '00000000-0000-0000-0000-000000000000.webp',
    );
  });
  it('로컬 저장소는 S3 prefix 설정과 관계없이 기존 파일 경로를 사용해야 한다', () => {
    vi.stubEnv('STORAGE_BACKEND', 'local');
    vi.stubEnv('S3_KEY_PREFIX', 'game-feedback/photo-contest');
    expect(createStagingKey()).toMatch(/^staging\/[a-f0-9-]{36}$/);
    expect(createMediaKey('png')).toMatch(/^[a-f0-9-]{36}\.png$/);
  });
  it.each(['../other', '/absolute', 'one//two', 's3://bucket', 'one/../../other'])(
    '위험한 prefix %s는 거부해야 한다',
    (prefix) => {
      vi.stubEnv('S3_KEY_PREFIX', prefix);
      expect(() => s3KeyPrefix()).toThrow('S3_KEY_PREFIX');
    },
  );
});
