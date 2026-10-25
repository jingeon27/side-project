import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { NO_STORE } from '../common/http/no-store.middleware';
import { s3KeyPrefix, s3Settings } from '../config/env';
import { MEDIA_IO_TIMEOUT_MS, MEDIA_URL_TTL_SECONDS } from '../config/limits';

const MEDIA_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
} as const;
export type TMediaExtension = keyof typeof MEDIA_TYPES;
const MEDIA_KEY = /^(?:[A-Za-z0-9_-]+\/)*[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/;
// 이전 staging 업로드는 확장자 없는 키로 남아 있을 수 있어 정리할 때만 허용한다.
const LEGACY_STAGING_KEY = /^(?:[A-Za-z0-9_-]+\/)*staging\/[a-f0-9-]{36}$/;

/** 저장소 키는 서버가 만든 UUID만 쓴다. 사용자 입력이 경로에 섞이지 않게 한다. */
function mediaKey(key: string) {
  if (!MEDIA_KEY.test(key)) throw new Error('Invalid media key');
  return key;
}
/** 키의 확장자는 발급할 때 허용한 형식에서 정했으므로 응답 형식도 여기서 고정한다. */
export function mediaContentType(key: string) {
  const extension = mediaKey(key).split('.').at(-1) as TMediaExtension;
  return MEDIA_TYPES[extension];
}
export function createMediaKey(extension: TMediaExtension) {
  return `${s3KeyPrefix()}${randomUUID()}.${extension}`;
}

/** 비공개 S3 호환 버킷. API는 서명과 HEAD·DELETE만 하고 파일 바이트를 읽거나 바꾸거나 중계하지 않는다. */
@Injectable()
export class MediaStorage {
  private s3?: { signature: string; client: S3Client; bucket: string };

  /** 브라우저가 최종 키에 직접 올리는 POST. 키·형식·정확한 크기·만료를 정책에 서명한다. */
  presignUpload(key: string, contentType: string, byteSize: number, expiresAt: Date) {
    const { client, bucket } = this.connection();
    // 정책은 티켓보다 먼저 끝나야 정리 작업이 지운 키에 늦은 전송이 다시 쓰지 못한다.
    const expires = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (expires <= 0) throw new Error('Upload ticket already expired');
    return createPresignedPost(client, {
      Bucket: bucket,
      Key: mediaKey(key),
      Expires: expires,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', byteSize, byteSize],
        ['eq', '$Content-Type', contentType],
      ],
    });
  }

  async head(key: string) {
    const { client, bucket } = this.connection();
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: mediaKey(key) }), {
      abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS),
    });
    return { byteSize: result.ContentLength ?? 0, contentType: result.ContentType ?? '' };
  }

  async delete(key: string) {
    if (!LEGACY_STAGING_KEY.test(key)) mediaKey(key);
    const { client, bucket } = this.connection();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(MEDIA_IO_TIMEOUT_MS),
    });
  }

  /**
   * 권한을 확인한 요청에만 주는 짧은 서명 GET. 응답 형식·캐시 금지·다운로드 이름을 서명에 넣고
   * Range는 저장소가 처리한다. 발급한 URL은 만료 전까지 권한 없이 읽을 수 있다.
   */
  presignRead(key: string, disposition?: string) {
    const { client, bucket } = this.connection();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: mediaKey(key),
        ResponseContentType: mediaContentType(key),
        ResponseCacheControl: NO_STORE,
        ...(disposition ? { ResponseContentDisposition: disposition } : {}),
      }),
      { expiresIn: MEDIA_URL_TTL_SECONDS },
    );
  }

  private connection() {
    const settings = s3Settings();
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;
    const signature = JSON.stringify({ settings, credentials });
    // 같은 설정이면 연결을 재사용한다. 테스트가 실행 중에 설정을 바꾸면 새로 만든다.
    if (this.s3?.signature !== signature)
      this.s3 = {
        signature,
        bucket: settings.bucket,
        client: new S3Client({
          region: settings.region,
          endpoint: settings.endpoint,
          forcePathStyle: settings.forcePathStyle,
          credentials,
        }),
      };
    return this.s3;
  }
}
