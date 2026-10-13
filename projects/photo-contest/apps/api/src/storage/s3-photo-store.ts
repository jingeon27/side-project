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

  async put(key: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, Body: body, ContentType: 'image/webp' }),
    );
  }

  async get(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }));
    if (!result.Body) throw new Error('Photo not found');
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }
}
