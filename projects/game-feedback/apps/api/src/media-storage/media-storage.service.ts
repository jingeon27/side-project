import { randomUUID } from 'node:crypto';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  object: Pick<MediaObject, 'backend' | 'key'> | null;
}

@Injectable()
export class MediaStorage implements OnModuleDestroy {
  private readonly s3: S3Client;
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    const storage = config.mediaStorage;
    this.s3 = new S3Client({
      region: storage.region,
      endpoint: storage.endpoint,
      forcePathStyle: storage.forcePathStyle,
      ...(storage.accessKeyId && storage.secretAccessKey
        ? { credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey } }
        : {}),
      maxAttempts: 3,
    });
  }
  private key(path: string) {
    const prefix = this.config.mediaStorage.keyPrefix;
    return prefix ? `${prefix}/${path}` : path;
  }

  async prepareUpload(mimeType: string, size: number) {
    const storage = this.config.mediaStorage;
    const object = { backend: 'S3', key: this.key(`staging/${randomUUID()}`) };
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
      return { object, form, expiresAt };
    } catch (cause) {
      throw new ApiError(
        503,
        'STORAGE_UNAVAILABLE',
        '업로드 주소를 만들지 못했습니다. 잠시 후 다시 시도해주세요.',
        { cause },
      );
    }
  }

  /**
   * 임시 객체의 크기·형식을 HEAD로, 매직 바이트를 앞부분 Range로만 확인한 뒤 서버 쪽 CopyObject로 확정한다.
   * 본문 전체를 API 메모리로 읽지 않는다. 같은 ETag 조건으로 읽고 복사해 검증 뒤 바꿔치기한 파일은 확정되지 않는다.
   */
  async completeUpload(file: IMediaReference & { name: string; size: number; mimeType: string }) {
    const storage = this.config.mediaStorage;
    if (
      file.object?.backend !== 'S3' ||
      !file.object.key.startsWith(this.key('staging/')) ||
      !/^[a-f0-9-]{36}$/.test(file.object.key.slice(this.key('staging/').length))
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
      const name = error instanceof Error ? error.name : undefined;
      const status = this.storageStatus(error);
      if (
        name !== 'NoSuchBucket' &&
        (status === 404 || (status === undefined && (name === 'NotFound' || name === 'NoSuchKey')))
      )
        throw new ApiError(400, 'UPLOAD_INCOMPLETE', 'S3 파일 전송을 완료한 뒤 다시 시도해주세요.');
      throw this.storageError(error, '파일 업로드 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    const validated = validateMediaHeader({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      header: await this.stagedHeader(source, etag, Math.min(file.size, MEDIA_SIGNATURE_BYTES)),
    });
    // 업로드 주소가 재사용되어도 확정 파일을 덮어쓸 수 없도록 별도 객체로 복사한다.
    const object = await this.register();
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

  private storageStatus(error: unknown) {
    if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
    const metadata = error.$metadata;
    if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata))
      return undefined;
    return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
  }

  /** 검증과 복사 사이에 임시 객체가 바뀌면(412) 다시 올리게 하고, 그 밖의 실패는 저장소 장애로 본다. */
  private storageError(error: unknown, message: string) {
    if (error instanceof ApiError) return error;
    const status = this.storageStatus(error);
    if (status === 412)
      return new ApiError(409, 'UPLOAD_CHANGED', '업로드한 파일이 바뀌었습니다. 파일을 다시 선택해주세요.', {
        cause: error,
      });
    return new ApiError(503, 'STORAGE_UNAVAILABLE', message, { cause: error });
  }

  async presignRead(file: IMediaReference, mimeType: string, disposition: string) {
    const storage = this.config.mediaStorage;
    if (file.object?.backend !== 'S3')
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
  private register() {
    return this.db.mediaObject.create({ data: { backend: 'S3', key: this.key(`objects/${randomUUID()}`) } });
  }

  /** Run under the operator lock, after the daily backup. Never delete a referenced object. */
  async prune() {
    const before = new Date(Date.now() - 86400000);
    await this.db.postMedia.deleteMany({ where: { postId: null, createdAt: { lt: before } } });
    await this.db.chatAttachment.deleteMany({ where: { messageId: null, createdAt: { lt: before } } });
    await this.db.avatarUpload.deleteMany({ where: { expiresAt: { lt: before } } });
    const storage = this.config.mediaStorage;
    await this.db.mediaObject.updateMany({
      where: {
        createdAt: { lt: before },
        retiredAt: null,
        postMedia: null,
        chatAttachment: null,
        avatar: null,
        avatarUpload: null,
      },
      data: { retiredAt: new Date() },
    });
    const objects = await this.db.mediaObject.findMany({
      where: {
        backend: 'S3',
        OR: [
          { retiredAt: { lt: new Date(Date.now() - 14 * 86400000) } },
          { key: { startsWith: this.key('staging/') }, createdAt: { lt: before } },
        ],
        postMedia: null,
        chatAttachment: null,
        avatar: null,
        avatarUpload: null,
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    const results = await Promise.allSettled(
      objects.map(async (object) => {
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
    this.s3.destroy();
  }
}
