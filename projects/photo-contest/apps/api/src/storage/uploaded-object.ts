import { S3ServiceException } from '@aws-sdk/client-s3';

import { DomainError, ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import type { MediaStorage } from './media-storage.service';

/** 업로드 완료 전에 저장소의 실제 크기·형식을 확인한다. */
export async function uploadedObjectMetadata(storage: MediaStorage, key: string) {
  try {
    return await storage.head(key);
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      error.$metadata.httpStatusCode === 404 &&
      ['NotFound', 'NoSuchKey'].includes(error.name)
    )
      fail('파일 전송을 완료한 뒤 다시 시도해 주세요.');
    // HEAD 403은 미존재와 권한 장애를 구분할 수 없어 서버 오류로 보고한다. 객체 미존재로 확인된 404만 위에서 처리한다.
    const original = error instanceof Error ? error : new Error('Unexpected storage error', { cause: error });
    throw new DomainError(ERROR_MESSAGE.INTERNAL, ERROR_CODE.INTERNAL_SERVER_ERROR, original);
  }
}
