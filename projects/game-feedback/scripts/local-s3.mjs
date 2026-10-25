import { join } from 'node:path';

import { S3Fixture } from '../apps/api/src/testing/s3-fixture.ts';
import { projectDir } from './env.mjs';

export async function startLocalS3(env) {
  if (!env.GF_S3_ENDPOINT || !/^http:\/\/(?:127\.0\.0\.1|localhost):4310\/?$/.test(env.GF_S3_ENDPOINT))
    return null;
  if (
    env.GF_S3_ACCESS_KEY_ID !== 'local-test-access-key' ||
    env.GF_S3_SECRET_ACCESS_KEY !== 'local-test-secret-key'
  )
    throw new Error('Local S3 fixture requires local-only credentials.');
  const s3 = await new S3Fixture({
    bucket: env.GF_S3_BUCKET,
    directory: join(projectDir, '.data', 's3'),
    corsOrigin: env.WEB_ORIGIN,
  }).start(4310);
  console.log('Local S3 endpoint: ' + s3.endpoint);
  return s3;
}
