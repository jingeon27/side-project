import { Readable } from 'node:stream';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { IS3Settings } from '../config/env';
import { MEDIA_IO_TIMEOUT_MS, POST_UPLOAD_TTL_SECONDS } from '../config/limits';
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
      { abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS) },
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS),
    });
  }
  presignUpload(key: string, contentType: string, byteSize: number, expiresIn = POST_UPLOAD_TTL_SECONDS) {
    return createPresignedPost(this.client, {
      Bucket: this.settings.bucket,
      Key: key,
      Expires: Math.min(POST_UPLOAD_TTL_SECONDS, expiresIn),
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', byteSize, byteSize],
        ['eq', '$Content-Type', contentType],
      ],
    });
  }
  async head(key: string) {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS),
    });
    return { byteSize: result.ContentLength ?? 0, contentType: result.ContentType ?? '' };
  }
  async copy(source: string, destination: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.settings.bucket,
        Key: destination,
        CopySource: `${encodeURIComponent(this.settings.bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`,
      }),
      { abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS) },
    );
  }
  async readRange(key: string, start: number, end: number) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.settings.bucket, Key: key, Range: `bytes=${start}-${end}` }),
      { abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS) },
    );
    const expected = end - start + 1;
    if (!(result.Body instanceof Readable)) throw new Error('Media stream unavailable');
    const stream = result.Body;
    if (result.ContentLength !== expected) {
      stream.destroy();
      throw new Error('Invalid media range length');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > expected) throw new Error('Media range exceeded');
        chunks.push(bytes);
      }
      if (size !== expected) throw new Error('Incomplete media range');
      return Buffer.concat(chunks, size);
    } finally {
      stream.destroy();
    }
  }

  presignDownload(key: string, disposition: string, expiresIn: number) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn },
    );
  }
}
