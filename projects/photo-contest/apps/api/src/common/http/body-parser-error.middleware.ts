import type { NextFunction, Request, Response } from 'express';

function errorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 400;
  const { status } = error;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : 400;
}

/** 본문 파싱 실패를 Express 기본 HTML 대신 다른 API 오류와 같은 { message } 형식으로 돌려준다. */
export function bodyParserErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(error);
    return;
  }
  const message = req.path.startsWith('/uploads/')
    ? '10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.'
    : '요청 본문을 읽을 수 없습니다.';
  res.status(errorStatus(error)).json({ message });
}
