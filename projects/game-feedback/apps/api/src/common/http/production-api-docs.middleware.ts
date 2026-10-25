import type { NextFunction, Request, Response } from 'express';

const DOCUMENTATION_PATH =
  /^\/(?:api\/)?(?:openapi(?:\.(?:json|ya?ml))?|docs(?:-json|-yaml)?|swagger(?:-ui)?(?:-json|-yaml|\.html)?|api-docs|api-json|api-yaml)(?:\/|$)/i;

/** SDK 생성 파일은 HTTP로 제공하지 않는다. 운영에서는 문서 UI·원본 경로도 먼저 닫는다. */
export function productionApiDocs(req: Request, res: Response, next: NextFunction) {
  const pathname = (() => {
    try {
      return decodeURIComponent(req.path);
    } catch {
      return req.path;
    }
  })();
  if (!DOCUMENTATION_PATH.test(pathname)) return next();
  res.status(404).json({ errorCode: 'NOT_FOUND', message: '요청을 처리할 수 없습니다.' });
}
