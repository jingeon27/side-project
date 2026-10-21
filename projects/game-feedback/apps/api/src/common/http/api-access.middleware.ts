import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { SessionService } from '../../auth/session.service';
import type { SessionRequest } from '../../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { isHealthProbe, requestRateBucket, RequestRateLimiter } from '../../rate-limit';
import { ApiError } from './api-error';
import { assertOrigin } from './origin';

@Injectable()
export class ApiAccessMiddleware implements NestMiddleware {
  private readonly limits = new RequestRateLimiter();

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private enforceLimit(res: Response, key: string, limit: number) {
    const retryAfter = this.limits.consume(key, limit);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      throw new ApiError(429, 'RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async use(req: SessionRequest, res: Response, next: NextFunction) {
    try {
      if (!req.path.startsWith('/api')) return next();
      if (isHealthProbe(req)) return next();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertOrigin(req, this.config.webOrigin);
      const ip = req.ip ?? 'unknown';
      if (this.config.rateLimit) this.enforceLimit(res, `coarse:ip:${ip}`, 1000);
      await this.sessions.loadSession(req);
      if (req.gfSession?.user?.bannedAt && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const allowed =
          req.path === '/api/support/conversations' ||
          req.path === '/api/auth/logout' ||
          (req.method === 'DELETE' && req.path === '/api/me') ||
          /^\/api\/conversations\/[^/]+\/(messages|read|attachments)(\/[^/]+)?$/.test(req.path);
        if (!allowed)
          throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
      }
      if (this.config.rateLimit) {
        const bucket = requestRateBucket({
          ip,
          userId: req.gfSession?.user?.id,
          path: req.path,
          method: req.method,
        });
        this.enforceLimit(res, bucket.key, bucket.limit);
      }
      next();
    } catch (error) {
      if (error instanceof ApiError) res.status(error.getStatus()).json(error.getResponse());
      else next(error);
    }
  }
}
