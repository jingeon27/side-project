import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { resolveMediaStorageConfig } from '../media-storage/media-storage.config.ts';
import type { MediaStorage } from '../media-storage/media-storage.service';

export function createS3TestConfig(env: NodeJS.ProcessEnv = process.env, runId: string = randomUUID()) {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid S3 test run identifier.');
  const config = resolveMediaStorageConfig(env);
  if (config.endpoint) throw new Error('S3 tests require AWS S3, not a custom endpoint.');
  return resolveMediaStorageConfig({
    ...env,
    GF_S3_KEY_PREFIX: [config.keyPrefix, 'tests', runId].filter(Boolean).join('/'),
  });
}

export class S3TestStorage {
  readonly config = createS3TestConfig();
  readonly requests: Array<{ method: string; path: string; range?: string; copySource?: string }> = [];
  beforeCopy?: (source: string) => Promise<void>;
  private readonly client = new S3Client({
    region: this.config.region,
    ...(this.config.accessKeyId && this.config.secretAccessKey
      ? {
          credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
        }
      : {}),
  });

  async verifyAccess() {
    try {
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: `${this.config.keyPrefix}/`,
          MaxKeys: 1,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch {
      this.client.destroy();
      throw new Error(
        'Real S3 tests require existing bucket credentials and ListBucket permission scoped to the tests/ prefix. No test objects were written.',
      );
    }
  }

  observe(storage: MediaStorage) {
    const client = (storage as unknown as { s3: S3Client }).s3;
    client.middlewareStack.add(
      (next, context) => async (args) => {
        const input = args.input as { Key?: string; Range?: string; CopySource?: string };
        const method = (
          { GetObjectCommand: 'GET', HeadObjectCommand: 'HEAD', CopyObjectCommand: 'PUT' } as Record<
            string,
            string
          >
        )[context.commandName ?? ''];
        if (method && input.Key)
          this.requests.push({
            method,
            path: `/${this.config.bucket}/${input.Key}`,
            ...(input.Range ? { range: input.Range } : {}),
            ...(input.CopySource ? { copySource: input.CopySource } : {}),
          });
        if (input.CopySource && this.beforeCopy)
          await this.beforeCopy(input.CopySource.slice(this.config.bucket.length + 1));
        return next(args);
      },
      { step: 'initialize', name: 'observeS3TestRequests' },
    );
  }

  private ownedKey(key: string) {
    if (!key.startsWith(`${this.config.keyPrefix}/`)) throw new Error('Unowned S3 test object.');
    return key;
  }

  async read(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: this.ownedKey(key) }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    return Buffer.from((await response.Body?.transformToByteArray()) ?? []);
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.ownedKey(key) }), {
        abortSignal: AbortSignal.timeout(15_000),
      });
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        '$metadata' in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
      )
        return false;
      throw error;
    }
  }

  async write(key: string, bytes: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.ownedKey(key),
        Body: bytes,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  }

  async close() {
    const state: { token?: string } = {};
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: `${this.config.keyPrefix}/`,
            ContinuationToken: state.token,
          }),
          { abortSignal: AbortSignal.timeout(15_000) },
        );
        for (const object of page.Contents ?? []) {
          if (object.Key)
            await this.client.send(
              new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: this.ownedKey(object.Key),
              }),
              { abortSignal: AbortSignal.timeout(15_000) },
            );
        }
        state.token = page.NextContinuationToken;
      } while (state.token);
    } finally {
      this.client.destroy();
    }
  }
}
