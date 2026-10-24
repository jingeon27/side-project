import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { ApiError } from '../common/http/api-error';
import { MEDIA_SIGNATURE_BYTES, validateMediaHeader } from '../common/media-file';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient, type MediaObject } from '../generated/prisma';
import { MEDIA_READ_TTL_SECONDS, MEDIA_UPLOAD_TTL_SECONDS } from './media-storage.policy';

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
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    const storage = config.mediaStorage;
    this.s3 =
      storage.driver === 'S3'
        ? new S3Client({
            region: storage.region,
            endpoint: storage.endpoint,
            forcePathStyle: storage.forcePathStyle,
            credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
            maxAttempts: 3,
          })
        : undefined;
  }

  async reserveUpload(mimeType: string, size: number) {
    const storage = this.config.mediaStorage;
    if (storage.driver !== 'S3' || !this.s3) return null;
    const object = await this.db.mediaObject.create({
      data: { backend: 'S3', key: `staging/${randomUUID()}` },
    });
    const expiresAt = new Date(Date.now() + MEDIA_UPLOAD_TTL_SECONDS * 1000).toISOString();
    try {
      const form = await createPresignedPost(this.s3, {
        Bucket: storage.bucket,
        Key: object.key,
        Expires: MEDIA_UPLOAD_TTL_SECONDS,
        Fields: { 'Content-Type': mimeType },
        Conditions: [
          ['content-length-range', size, size],
          ['eq', '$Content-Type', mimeType],
        ],
      });
      return { objectId: object.id, form, expiresAt };
    } catch {
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        '업로드 주소를 만들지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /** 직접 업로드가 있는 S3에서는 API 프로세스가 파일 본문을 받는 multipart 경로를 쓰지 않는다. */
  assertProxyUpload() {
    if (this.config.mediaStorage.driver === 'S3')
      throw new ApiError(409, 'DIRECT_UPLOAD_REQUIRED', '업로드 주소를 다시 받아 파일을 올려주세요.');
  }

  /**
   * 임시 객체의 크기·형식을 HEAD로, 매직 바이트를 앞부분 Range로만 확인한 뒤 서버 쪽 CopyObject로 확정한다.
   * 본문 전체를 API 메모리로 읽지 않는다. 같은 ETag 조건으로 읽고 복사해 검증 뒤 바꿔치기한 파일은 확정되지 않는다.
   */
  async completeUpload(file: IMediaReference & { name: string; size: number; mimeType: string }) {
    const storage = this.config.mediaStorage;
    if (
      storage.driver !== 'S3' ||
      !this.s3 ||
      file.object?.backend !== 'S3' ||
      !/^staging\/[a-f0-9-]{36}$/.test(file.object.key)
    )
      throw new ApiError(400, 'INVALID_MEDIA', '업로드 요청을 다시 시작해주세요.');
    const source = file.object.key;
    let etag: string;
    try {
      const metadata = await this.s3.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: source }));
      if (metadata.ContentLength !== file.size || metadata.ContentType !== file.mimeType || !metadata.ETag)
        throw new ApiError(400, 'INVALID_ATTACHMENT', '업로드한 파일의 크기와 형식을 확인해주세요.');
      etag = metadata.ETag;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'UPLOAD_INCOMPLETE', 'S3 파일 전송을 완료한 뒤 다시 시도해주세요.');
    }
    const validated = validateMediaHeader({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      header: await this.stagedHeader(source, etag, Math.min(file.size, MEDIA_SIGNATURE_BYTES)),
    });
    // 업로드 주소가 재사용되어도 확정 파일을 덮어쓸 수 없도록 별도 객체로 복사한다.
    const object = await this.register(storage.driver);
    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: storage.bucket,
          Key: object.key,
          CopySource: `${storage.bucket}/${source}`,
          CopySourceIfMatch: etag,
          ContentType: validated.mimeType,
          MetadataDirective: 'REPLACE',
        }),
      );
    } catch (error) {
      throw this.storageError(error, '파일을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    return { bytes: null, objectId: object.id, name: validated.name };
  }

  private async stagedHeader(key: string, etag: string, length: number) {
    const storage = this.config.mediaStorage;
    if (storage.driver !== 'S3' || !this.s3)
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
    try {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: key,
          IfMatch: etag,
          Range: `bytes=0-${length - 1}`,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes || bytes.byteLength !== length) throw new Error('Incomplete file header');
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch (error) {
      throw this.storageError(error, '파일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  /** 검증과 복사 사이에 임시 객체가 바뀌면(412) 다시 올리게 하고, 그 밖의 실패는 저장소 장애로 본다. */
  private storageError(error: unknown, message: string) {
    if (error instanceof ApiError) return error;
    const status =
      typeof error === 'object' && error !== null && '$metadata' in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined;
    if (status === 412)
      return new ApiError(409, 'UPLOAD_CHANGED', '업로드한 파일이 바뀌었습니다. 파일을 다시 선택해주세요.');
    return new ApiError(503, 'STORAGE_UNAVAILABLE', message);
  }

  async presignRead(file: IMediaReference, mimeType: string, disposition: string) {
    const storage = this.config.mediaStorage;
    if (file.bytes !== null || storage.driver !== 'S3') return null;
    if (!this.s3 || file.object?.backend !== 'S3')
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
    try {
      return await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: file.object.key,
          ResponseContentType: mimeType,
          ResponseContentDisposition: disposition,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: MEDIA_READ_TTL_SECONDS },
      );
    } catch {
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        '파일 주소를 만들지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /** Register before external IO so failed uploads remain eligible for orphan cleanup. */
  private register(backend: 'FILESYSTEM' | 'S3') {
    return this.db.mediaObject.create({ data: { backend, key: `objects/${randomUUID()}` } });
  }

  private path(key: string) {
    if (!/^objects\/[a-f0-9-]{36}$/.test(key) || this.config.mediaStorage.driver !== 'FILESYSTEM')
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '파일 저장소를 사용할 수 없습니다.');
    return join(this.config.mediaStorage.directory, key);
  }

  async save(bytes: Buffer, mimeType: string) {
    const storage = this.config.mediaStorage;
    if (storage.driver === 'DATABASE') return { bytes: Uint8Array.from(bytes), objectId: null };
    const object = await this.register(storage.driver);
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
    await this.db.postMedia.deleteMany({ where: { postId: null, createdAt: { lt: before } } });
    await this.db.chatAttachment.deleteMany({ where: { messageId: null, createdAt: { lt: before } } });
    const storage = this.config.mediaStorage;
    await this.db.mediaObject.updateMany({
      where: {
        createdAt: { lt: before },
        retiredAt: null,
        postMedia: null,
        chatAttachment: null,
        avatar: null,
      },
      data: { retiredAt: new Date() },
    });
    const objects = await this.db.mediaObject.findMany({
      where: {
        backend: storage.driver,
        OR: [
          { retiredAt: { lt: new Date(Date.now() - 14 * 86400000) } },
          { key: { startsWith: 'staging/' }, createdAt: { lt: before } },
        ],
        postMedia: null,
        chatAttachment: null,
        avatar: null,
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
        await this.db.mediaObject.delete({ where: { id: object.id } });
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
