import { ApiError } from '../../common/http/api-error';
import type { SessionRequest } from './session.types';

export function requireUser(req: SessionRequest) {
  const user = req.gfSession?.user;
  if (!user || user.withdrawnAt) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return user;
}

/** 가입 전에는 소셜 인증을 마친 세션으로 공개 게임 프로필 조회만 허용한다. */
export function requireProfileLookupSession(req: SessionRequest) {
  if (!req.gfSession?.user && !req.gfSession?.pendingSubject)
    throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
}

export function requireAdmin(req: SessionRequest) {
  const user = requireUser(req);
  if (user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  return user;
}
