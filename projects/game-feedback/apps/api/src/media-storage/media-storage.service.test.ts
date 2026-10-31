import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../common/http/api-error';
import type { AppConfig } from '../config/app.config';
import type { PrismaClient } from '../generated/prisma';
import { MediaStorage } from './media-storage.service';

vi.mock('@aws-sdk/s3-presigned-post', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/s3-presigned-post')>();
  return { ...original, createPresignedPost: vi.fn(original.createPresignedPost) };
});

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

describe('S3 업로드 서명 준비', () => {
  it('DB에 접근하지 않고 크기·형식·임시 키를 고정한 정책을 준비해야 한다', async () => {
    const upload = await storage().prepareUpload('image/png', file.size);
    expect(upload.object).toEqual({ backend: 'S3', key: expect.stringMatching(/^staging\/[a-f0-9-]{36}$/) });
    expect(upload.form.fields.key).toBe(upload.object.key);
    const policy = JSON.parse(Buffer.from(upload.form.fields.Policy ?? '', 'base64').toString());
    expect(policy.conditions).toContainEqual(['content-length-range', file.size, file.size]);
    expect(policy.conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    expect(dayjs(upload.expiresAt).diff(dayjs())).toBeGreaterThan(290_000);
  });

  it('서명 실패에도 DB를 쓰지 않고 원인을 보존한 저장소 오류를 반환해야 한다', async () => {
    const cause = new Error('Signing credentials unavailable');
    vi.mocked(createPresignedPost).mockRejectedValueOnce(cause);
    await expect(storage().prepareUpload('image/png', file.size)).rejects.toMatchObject({
      status: 503,
      response: { errorCode: 'STORAGE_UNAVAILABLE' },
      cause,
    });
  });
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
