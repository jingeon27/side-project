import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { isProduction } from '../../config/env';
import { MEDIA_RATE_LIMIT_PER_WINDOW, MEDIA_RATE_LIMIT_WINDOW_MS } from '../../config/limits';
import { rateLimitAddress } from './client-address';
import { FixedWindowCounter } from './graphql-rate-limit.middleware';

export const MEDIA_RATE_LIMITED = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

// 권한을 확인한 뒤 서명 GET으로 보내는 고정 경로만 센다. 업로드 발급·완료는 GraphQL 제한을 따른다.
const MEDIA_PATH =
  /^\/(?:media\/[^/]+(?:\/download)?|photos\/[^/]+|groups\/[^/]+\/(?:avatar|cover)\/[^/]+|profiles\/[^/]+\/avatar\/[^/]+)\/?$/i;

export function isMediaPath(path: string) {
  return MEDIA_PATH.test(path);
}

/**
 * 운영에서 고정 미디어 경로 요청을 사용자 주소마다 제한한다. GraphQL과 따로, 앱 인스턴스(프로세스)마다 센다.
 * 주소 규칙은 GraphQL과 같다(rateLimitAddress: 전달 헤더 없는 내부 웹 서버 요청은 세지 않는다).
 */
export function mediaRateLimit(): RequestHandler {
  const counter = new FixedWindowCounter(MEDIA_RATE_LIMIT_WINDOW_MS);
  return function limitMedia(req: Request, res: Response, next: NextFunction) {
    const address = isProduction() && isMediaPath(req.path) ? rateLimitAddress(req) : null;
    if (!address) {
      next();
      return;
    }
    const { count, resetAt } = counter.hit(address);
    if (count <= MEDIA_RATE_LIMIT_PER_WINDOW) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1)));
    res.status(429).json({ message: MEDIA_RATE_LIMITED });
  };
}
