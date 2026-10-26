import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export function s3TestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  runId = randomUUID().replaceAll('-', ''),
): Record<string, string> {
  if (!/^(?:[a-z][a-z_]*_)?[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid S3 test run identifier.');
  if (!env.S3_BUCKET || !env.S3_REGION) throw new Error('S3 tests require S3_BUCKET and S3_REGION.');
  if (env.S3_ENDPOINT) throw new Error('S3 tests require AWS S3, not a custom endpoint.');
  const prefix = (env.S3_KEY_PREFIX ?? '').trim().replace(/\/$/, '');
  if (prefix && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))
    throw new Error('Invalid S3_KEY_PREFIX.');
  return {
    ...Object.fromEntries(
      [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_PROFILE',
        'AWS_REGION',
      ].flatMap((name) => (env[name] ? [[name, env[name]]] : [])),
    ),
    S3_BUCKET: env.S3_BUCKET,
    S3_REGION: env.S3_REGION,
    S3_ENDPOINT: '',
    S3_FORCE_PATH_STYLE: 'false',
    S3_KEY_PREFIX: [prefix, 'tests', runId].filter(Boolean).join('/'),
  };
}

function testS3Client(env: Record<string, string>) {
  const prefix = env.S3_KEY_PREFIX ?? '';
  if (!/(?:^|\/)tests\/(?:[a-z][a-z_]*_)?[a-f0-9]{32}$/.test(prefix))
    throw new Error('Unowned S3 test prefix.');
  return new S3Client({
    region: env.S3_REGION,
    profile: env.AWS_PROFILE,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
          },
        }
      : {}),
  });
}

export async function verifyS3TestAccess(env: Record<string, string>) {
  const client = testS3Client(env);
  try {
    await client.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: `${env.S3_KEY_PREFIX}/`,
        MaxKeys: 1,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  } catch {
    throw new Error(
      'Real S3 tests require existing bucket credentials and ListBucket permission scoped to the tests/ prefix. No test objects were written.',
    );
  } finally {
    client.destroy();
  }
}

export async function cleanupS3TestObjects(env: Record<string, string>) {
  const client = testS3Client(env);
  const prefix = env.S3_KEY_PREFIX ?? '';
  const state: { token?: string } = {};
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: `${prefix}/`,
          ContinuationToken: state.token,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key?.startsWith(`${prefix}/`)) throw new Error('Unowned S3 test object.');
        await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: object.Key }), {
          abortSignal: AbortSignal.timeout(15_000),
        });
      }
      state.token = page.NextContinuationToken;
    } while (state.token);
  } finally {
    client.destroy();
  }
}
