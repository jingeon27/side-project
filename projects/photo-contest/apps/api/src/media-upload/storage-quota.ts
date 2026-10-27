import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { USER_STORAGE_QUOTA_BYTES } from '../config/limits';
import type { TDatabaseClient } from '../database/database.service';

export const STORAGE_QUOTA_EXCEEDED =
  '올릴 수 있는 저장 공간(5GB)을 모두 썼습니다. 쓰지 않는 게시물을 지운 뒤 다시 시도해 주세요.';

/**
 * 계정 하나가 버킷을 무한히 채우지 못하게 지금까지 맡긴 원본(게시물·대회·대표·프로필 사진, 지우는 중인 파일 포함)과
 * 새 파일의 합을 본다. 발급 트랜잭션 안에서 불러 동시 발급도 같은 합계를 보며, 두 표의 userId 인덱스로 그 사용자 행만 읽는다.
 */
export async function assertStorageQuota(client: TDatabaseClient, viewer: IViewer, byteSize: number) {
  const [posts, profiles] = await Promise.all([
    client.postUpload.aggregate({ where: { userId: viewer.id }, _sum: { byteSize: true } }),
    client.profileUpload.aggregate({ where: { userId: viewer.id }, _sum: { byteSize: true } }),
  ]);
  const used = (posts._sum.byteSize ?? 0) + (profiles._sum.byteSize ?? 0);
  if (used + byteSize > USER_STORAGE_QUOTA_BYTES) fail(STORAGE_QUOTA_EXCEEDED, ERROR_CODE.RATE_LIMITED);
}
