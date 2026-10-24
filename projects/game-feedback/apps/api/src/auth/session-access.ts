import { ApiError } from '../common/http/api-error';
import type { SessionRequest } from './session.types';

export function requireUser(req: SessionRequest) {
  const user = req.gfSession?.user;
  if (!user || user.withdrawnAt) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return user;
}

export function requireAdmin(req: SessionRequest) {
  const user = requireUser(req);
  if (user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  return user;
}
