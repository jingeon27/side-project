import { MediaStorageRepository } from './media-storage.repository';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type MediaObject } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ApiError } from '../common/http/api-error';

interface IMediaReference {
  bytes: Uint8Array | null;
  object: Pick<MediaObject, 'backend' | 'key'> | null;
}
interface IMediaRange {
  start: number;
  end: number;
}

@Injectable()
export class MediaStorage implements OnModuleDestroy {
  private readonly s3: S3Client | undefined;
  constructor(
    @Inject(MediaStorageRepository) private readonly repository: MediaStorageRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    const storage = config.mediaStorage;
    this.s3 =
      storage.driver === 'S3'
        ? new S3Client({
            region: storage.region,
            endpoint: storage.endpoint,
            credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
            maxAttempts: 3,
          })
        : undefined;
  }

  private path(key: string) {
    if (!/^objects\/[a-f0-9-]{36}$/.test(key) || this.config.mediaStorage.driver !== 'FILESYSTEM')
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
    return join(this.config.mediaStorage.directory, key);
  }

  async save(bytes: Buffer, mimeType: string) {
    const storage = this.config.mediaStorage;
    if (storage.driver === 'DATABASE') return { bytes: Uint8Array.from(bytes), objectId: null };
    // Register before external IO so failed uploads remain eligible for orphan cleanup.
    const object = await this.repository.createMediaObject({
      data: { backend: storage.driver, key: `objects/${randomUUID()}` },
    });
    try {
      if (storage.driver === 'FILESYSTEM') {
        await mkdir(join(storage.directory, 'objects'), { recursive: true, mode: 0o700 });
        await writeFile(this.path(object.key), bytes, { flag: 'wx', mode: 0o600 });
      }
      if (storage.driver === 'S3' && this.s3)
        await this.s3.send(
          new PutObjectCommand({
            Bucket: storage.bucket,
            Key: object.key,
            Body: bytes,
            ContentType: mimeType,
            IfNoneMatch: '*',
          }),
        );
      return { bytes: null, objectId: object.id };
    } catch {
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        '파일을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  async read(file: IMediaReference, range: IMediaRange) {
    if (file.bytes !== null) return Buffer.from(file.bytes).subarray(range.start, range.end + 1);
    const object = file.object;
    const storage = this.config.mediaStorage;
    if (!object || object.backend !== storage.driver)
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
    try {
      if (storage.driver === 'FILESYSTEM') {
        const handle = await open(this.path(object.key), 'r');
        try {
          const buffer = Buffer.alloc(range.end - range.start + 1);
          const result = await handle.read(buffer, 0, buffer.length, range.start);
          if (result.bytesRead !== buffer.length) throw new Error('Incomplete file');
          return buffer;
        } finally {
          await handle.close();
        }
      }
      if (storage.driver === 'S3' && this.s3) {
        const result = await this.s3.send(
          new GetObjectCommand({
            Bucket: storage.bucket,
            Key: object.key,
            Range: `bytes=${range.start}-${range.end}`,
          }),
        );
        const bytes = await result.Body?.transformToByteArray();
        if (!bytes || bytes.byteLength !== range.end - range.start + 1) throw new Error('Incomplete file');
        return Buffer.from(bytes);
      }
    } catch {
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        '파일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
  }

  /** Run under the operator lock, after the daily backup. Never delete a referenced object. */
  async prune() {
    const before = new Date(Date.now() - 86400000);
    await this.repository.deleteManyPostMedia({ where: { postId: null, createdAt: { lt: before } } });
    await this.repository.deleteManyChatAttachment({ where: { messageId: null, createdAt: { lt: before } } });
    const storage = this.config.mediaStorage;
    await this.repository.updateManyMediaObject({
      where: { createdAt: { lt: before }, retiredAt: null, postMedia: null, chatAttachment: null },
      data: { retiredAt: new Date() },
    });
    const objects = await this.repository.findManyMediaObject({
      // Keep deleted content for 14 days so seven-day operator backups remain restorable.
      where: {
        backend: storage.driver,
        retiredAt: { lt: new Date(Date.now() - 14 * 86400000) },
        postMedia: null,
        chatAttachment: null,
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    const results = await Promise.allSettled(
      objects.map(async (object) => {
        if (storage.driver === 'FILESYSTEM')
          await unlink(this.path(object.key)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        if (storage.driver === 'S3' && this.s3)
          await this.s3.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: object.key }));
        await this.repository.deleteMediaObject({ where: { id: object.id } });
      }),
    );
    return {
      removed: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
    };
  }

  onModuleDestroy() {
    this.s3?.destroy();
  }
}
