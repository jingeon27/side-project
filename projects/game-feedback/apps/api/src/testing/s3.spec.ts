import { describe, expect, it } from 'vitest';

import { createS3TestConfig } from './s3';

const runId = '00000000-0000-4000-8000-000000000001';

describe('실제 S3 테스트 설정', () => {
  it('설정한 버킷과 개발 경로 아래에 실행별 객체 경로만 분리해야 한다', () => {
    const config = createS3TestConfig(
      {
        GF_S3_BUCKET: 'configured-media',
        GF_S3_REGION: 'ap-northeast-2',
        GF_S3_KEY_PREFIX: 'game-feedback/local',
      },
      runId,
    );
    expect(config.bucket).toBe('configured-media');
    expect(config.keyPrefix).toBe(`game-feedback/local/tests/${runId}`);
    expect(config.endpoint).toBeUndefined();
    expect(config.accessKeyId).toBeUndefined();
  });

  it('버킷 누락이나 로컬 대역 주소를 가짜 저장소로 대체하지 않아야 한다', () => {
    expect(() => createS3TestConfig({}, runId)).toThrow('S3');
    expect(() =>
      createS3TestConfig(
        { GF_S3_BUCKET: 'configured-media', GF_S3_ENDPOINT: 'http://127.0.0.1:4310' },
        runId,
      ),
    ).toThrow('AWS S3');
    expect(() => createS3TestConfig({ GF_S3_BUCKET: 'configured-media' }, '../other')).toThrow('identifier');
  });
});
