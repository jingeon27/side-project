import { describe, expect, it } from 'vitest';

import { isolatedSchemaName, TEST_SCHEMA_PREFIXES } from './database';
import { s3TestEnvironment } from './s3';

const env = { S3_BUCKET: 'configured-media', S3_REGION: 'ap-northeast-2', S3_KEY_PREFIX: 'photo-contest/ci' };

// web_e2e·mobile_e2e처럼 숫자가 든 레인 접두사를 실행 ID로 받지 못해 브라우저 레인의 API 서버가 시작하지 못했다.
describe('격리 스키마를 S3 실행 ID로 쓰는 레인', () => {
  it.each(TEST_SCHEMA_PREFIXES)('%s 레인의 스키마 이름으로 실행 전용 경로를 만들어야 한다', (prefix) => {
    const schema = isolatedSchemaName(prefix);
    expect(s3TestEnvironment(env, schema).S3_KEY_PREFIX).toBe(`photo-contest/ci/tests/${schema}`);
  });
});
