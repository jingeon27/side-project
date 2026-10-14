import type { NextFunction, Request, Response } from 'express';

export const NO_STORE = 'private, no-store';

/** 응답마다 사용자별 데이터가 섞여 있으므로 어떤 캐시에도 남기지 않는다. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', NO_STORE);
  next();
}
