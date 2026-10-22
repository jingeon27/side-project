import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { isProduction } from '../../config/env';
import { GRAPHQL_RATE_LIMIT_PER_WINDOW, GRAPHQL_RATE_LIMIT_WINDOW_MS } from '../../config/limits';
import { ERROR_CODE } from '../errors';
import { rateLimitAddress } from './client-address';

export const GRAPHQL_RATE_LIMITED = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

/**
 * 주소마다 첫 요청부터 고정 창 동안 요청 수를 센다.
 * 창 길이마다 끝난 창을 지워 메모리가 최근 두 창 안의 주소 수를 넘지 않는다.
 */
export class FixedWindowCounter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private sweepAt = 0;

  constructor(private readonly windowMs: number) {}

  hit(key: string, now = Date.now()) {
    if (now >= this.sweepAt) {
      for (const [address, window] of this.windows) if (window.resetAt <= now) this.windows.delete(address);
      this.sweepAt = now + this.windowMs;
    }
    const current = this.windows.get(key);
    const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + this.windowMs };
    window.count += 1;
    this.windows.set(key, window);
    return { count: window.count, resetAt: window.resetAt };
  }

  /** 지금 기억하는 주소 수 */
  get size() {
    return this.windows.size;
  }
}

/**
 * 운영에서 GraphQL 요청을 사용자 주소마다 제한한다. 앱 인스턴스(프로세스)마다 따로 센다.
 * 본문을 읽기 전에 거절해 큰 요청을 반복해도 파싱·실행 비용이 들지 않는다.
 */
export function graphqlRateLimit(): RequestHandler {
  const counter = new FixedWindowCounter(GRAPHQL_RATE_LIMIT_WINDOW_MS);
  return function limitGraphql(req: Request, res: Response, next: NextFunction) {
    const address = isProduction() ? rateLimitAddress(req) : null;
    if (!address) {
      next();
      return;
    }
    const { count, resetAt } = counter.hit(address);
    if (count <= GRAPHQL_RATE_LIMIT_PER_WINDOW) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1)));
    res.status(429).json({
      errors: [{ message: GRAPHQL_RATE_LIMITED, extensions: { code: ERROR_CODE.RATE_LIMITED } }],
    });
  };
}
