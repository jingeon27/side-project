import { S3ServiceException } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODE, ERROR_MESSAGE } from '../common/errors';
import { MediaStorage } from './media-storage.service';
import { uploadedObjectMetadata } from './uploaded-object';

afterEach(() => vi.restoreAllMocks());

describe('업로드 객체 HEAD 오류 분류 회귀', () => {
  it.each(['NotFound', 'NoSuchKey'])(
    '객체 미존재 %s 404만 기존 업로드 미완료 오류로 알려야 한다',
    async (name) => {
      const storage = new MediaStorage();
      vi.spyOn(storage, 'head').mockRejectedValueOnce(
        new S3ServiceException({
          name,
          message: 'private-object-key',
          $fault: 'client',
          $metadata: { httpStatusCode: 404 },
        }),
      );
      await expect(uploadedObjectMetadata(storage, 'unused')).rejects.toMatchObject({
        message: '파일 전송을 완료한 뒤 다시 시도해 주세요.',
        extensions: { code: ERROR_CODE.BAD_USER_INPUT },
      });
    },
  );

  it.each([
    new S3ServiceException({
      name: 'AccessDenied',
      message: 'private-credentials',
      $fault: 'client',
      $metadata: { httpStatusCode: 403 },
    }),
    new S3ServiceException({
      name: 'NotFound',
      message: 'private-ambiguous-head',
      $fault: 'client',
      $metadata: { httpStatusCode: 403 },
    }),
    new S3ServiceException({
      name: 'SlowDown',
      message: 'private-bucket',
      $fault: 'server',
      $metadata: { httpStatusCode: 503 },
    }),
    new S3ServiceException({
      name: 'NoSuchBucket',
      message: 'private-bucket',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    }),
    Object.assign(new Error('private-timeout'), { name: 'TimeoutError' }),
    new Error('private-configuration'),
  ])('저장소 장애 $name는 원인을 보존한 서버 오류로 올려야 한다', async (failure) => {
    const storage = new MediaStorage();
    vi.spyOn(storage, 'head').mockRejectedValueOnce(failure);
    const result = await uploadedObjectMetadata(storage, 'unused').catch((error: unknown) => error);
    expect(result).toMatchObject({
      message: ERROR_MESSAGE.INTERNAL,
      extensions: { code: ERROR_CODE.INTERNAL_SERVER_ERROR },
      originalError: failure,
    });
  });
});
