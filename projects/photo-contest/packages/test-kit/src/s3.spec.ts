import { describe, expect, it } from 'vitest';

import { cleanupS3TestObjects, s3TestEnvironment, verifyS3TestAccess } from './s3';

const runId = 'api_test_00000000000040008000000000000001';

describe('실제 S3 테스트 설정', () => {
  it('기존 버킷 설정을 유지하고 실행별 객체 경로만 격리해야 한다', () => {
    const env = s3TestEnvironment(
      {
        S3_BUCKET: 'configured-media',
        S3_REGION: 'ap-northeast-2',
        S3_KEY_PREFIX: 'photo-contest/local',
        AWS_PROFILE: 'local-profile',
      },
      runId,
    );
    expect(env).toMatchObject({
      S3_BUCKET: 'configured-media',
      S3_REGION: 'ap-northeast-2',
      S3_KEY_PREFIX: `photo-contest/local/tests/${runId}`,
      AWS_PROFILE: 'local-profile',
      S3_ENDPOINT: '',
      S3_FORCE_PATH_STYLE: 'false',
    });
  });

  it('설정이 없거나 가짜 endpoint이면 대역을 만들지 않고 실패해야 한다', () => {
    expect(() => s3TestEnvironment({}, runId)).toThrow('S3_BUCKET');
    expect(() =>
      s3TestEnvironment(
        { S3_BUCKET: 'configured-media', S3_REGION: 'ap-northeast-2', S3_ENDPOINT: 'http://127.0.0.1:4210' },
        runId,
      ),
    ).toThrow('AWS S3');
    expect(() =>
      s3TestEnvironment({ S3_BUCKET: 'configured-media', S3_REGION: 'ap-northeast-2' }, '../other'),
    ).toThrow('identifier');
  });

  it.each(['', 'photo-contest/local', 'photo-contest/local/tests', 'tests/../local'])(
    '실행 전용이 아닌 경로 %s는 AWS 접속 전에 정리를 거부해야 한다',
    async (prefix) => {
      await expect(cleanupS3TestObjects({ S3_KEY_PREFIX: prefix })).rejects.toThrow('Unowned');
      await expect(verifyS3TestAccess({ S3_KEY_PREFIX: prefix })).rejects.toThrow('Unowned');
    },
  );
});
