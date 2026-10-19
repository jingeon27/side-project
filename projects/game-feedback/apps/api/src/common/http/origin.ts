import type { Request } from 'express';
import { ApiError } from './api-error';

export function assertOrigin(req: Request, webOrigin: string) {
  const origin = req.headers.origin;
  if (origin !== webOrigin || req.headers['sec-fetch-site'] === 'cross-site')
    throw new ApiError(403, 'INVALID_ORIGIN', '요청 출처를 확인할 수 없습니다.');
}
