import { Readable } from 'node:stream';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { IS3Settings } from '../config/env';
import type { IPhotoStore } from './photo-store';

export class S3PhotoStore implements IPhotoStore {
  private readonly client: S3Client;

  constructor(private readonly settings: IS3Settings) {
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
    });
  }

  async put(key: string, body: Buffer, contentType = 'image/webp') {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }));
    if (!result.Body) throw new Error('Photo not found');
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async stream(key: string, range?: { start: number; end: number }) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!(result.Body instanceof Readable)) throw new Error('Media stream unavailable');
    return { body: result.Body, size: result.ContentLength ?? 0 };
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }
}
