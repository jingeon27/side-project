import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { expect, it } from 'vitest';

import { S3Fixture } from './s3-fixture';

it('persists signed local uploads across restarts and exposes CORS only to the configured web origin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gf-local-s3-'));
  const first = await new S3Fixture({
    directory,
    bucket: 'game-feedback-dev',
    corsOrigin: 'http://localhost:3300',
  }).start();
  const client = new S3Client({
    ...first.config,
    credentials: { accessKeyId: first.config.accessKeyId, secretAccessKey: first.config.secretAccessKey },
  });
  try {
    const form = await createPresignedPost(client, {
      Bucket: first.config.bucket,
      Key: 'game-feedback/local/staging/file',
      Fields: { 'Content-Type': 'image/png' },
      Conditions: [['content-length-range', 4, 4]],
      Expires: 300,
    });
    const body = new FormData();
    for (const [key, value] of Object.entries(form.fields)) body.append(key, value);
    body.append('file', new Blob(['file'], { type: 'image/png' }), 'file.png');
    const response = await fetch(form.url, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3300' },
      body,
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3300');
    const denied = await fetch(form.url, { method: 'OPTIONS', headers: { Origin: 'https://foreign.test' } });
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    await first.close();
    const second = await new S3Fixture({ directory, bucket: 'game-feedback-dev' }).start();
    try {
      const read = await fetch(`${second.endpoint}/game-feedback-dev/game-feedback/local/staging/file`);
      expect(await read.text()).toBe('file');
    } finally {
      await second.close();
    }
  } finally {
    client.destroy();
    await first.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
