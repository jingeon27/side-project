import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../common/http/api-error';
import type { AppConfig } from '../config/app.config';
import type { PrismaClient } from '../generated/prisma';
import { MediaStorage } from './media-storage.service';

const services: MediaStorage[] = [];
const file = {
  object: { backend: 'S3', key: 'staging/00000000-0000-4000-8000-000000000000' },
  name: 'photo.png',
  mimeType: 'image/png',
  size: 12,
};

function storage() {
  const service = new MediaStorage(
    {} as PrismaClient,
    {
      mediaStorage: {
        bucket: 'unit-signing-only',
        region: 'ap-northeast-2',
        forcePathStyle: false,
        accessKeyId: 'unit-signing-key',
        secretAccessKey: 'unit-signing-secret',
      },
    } as AppConfig,
  );
  services.push(service);
  return service;
}

afterEach(() => {
  for (const service of services) service.onModuleDestroy();
  services.length = 0;
  vi.restoreAllMocks();
});

describe('S3 업로드 완료 HEAD 오류 분류', () => {
  it.each([
    Object.assign(new Error('upstream timeout'), { name: 'TimeoutError' }),
    Object.assign(new Error('socket disconnected'), { code: 'ECONNRESET' }),
    Object.assign(new Error('invalid storage permission'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    }),
    Object.assign(new Error('ambiguous missing object'), {
      name: 'NotFound',
      $metadata: { httpStatusCode: 403 },
    }),
    Object.assign(new Error('upstream unavailable'), { $metadata: { httpStatusCode: 503 } }),
    Object.assign(new Error('missing storage bucket'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    }),
    Object.assign(new Error('unknown storage failure'), { $metadata: null }),
  ])('저장소 장애는 503으로 보고하고 원인 객체를 보존해야 한다 (%s)', async (cause) => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(cause);
    const completion = storage().completeUpload(file);
    await expect(completion).rejects.toMatchObject({
      status: 503,
      response: { errorCode: 'STORAGE_UNAVAILABLE' },
      cause,
    });
    await expect(completion).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.cause === cause,
    );
  });

  it.each([
    Object.assign(new Error('missing object'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }),
    Object.assign(new Error('missing key'), { name: 'NoSuchKey' }),
  ])('없는 업로드는 400 UPLOAD_INCOMPLETE를 유지해야 한다 (%s)', async (cause) => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(cause);
    await expect(storage().completeUpload(file)).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 'UPLOAD_INCOMPLETE' },
    });
  });

  it('업로드한 크기·형식이 다르면 400 INVALID_ATTACHMENT를 유지해야 한다', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockImplementationOnce(async () => ({
      ContentLength: file.size + 1,
      ContentType: file.mimeType,
      ETag: 'test-etag',
      $metadata: {},
    }));
    await expect(storage().completeUpload(file)).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 'INVALID_ATTACHMENT' },
    });
  });
});
