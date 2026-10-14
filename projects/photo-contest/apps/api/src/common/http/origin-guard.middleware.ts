import type { NextFunction, Request, Response } from 'express';

import { webOrigin } from '../../config/env';
import { ERROR_MESSAGE } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 쿠키로 인증하므로 상태를 바꾸는 요청은 웹 origin에서 온 것만 받는다. */
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || req.headers.origin === webOrigin()) {
    next();
    return;
  }
  res.status(403).json({ message: ERROR_MESSAGE.FORBIDDEN_ORIGIN });
}
