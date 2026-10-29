import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { SessionService } from '../../auth/session/session.service';
import type { SessionRequest } from '../../auth/session/session.types';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { coarseRateBucket, isHealthProbe, requestRateBuckets, RequestRateLimiter } from '../../rate-limit';
import { ApiError } from './api-error';
import { bannedUserMayWrite } from './banned-access';
import { INTERNAL_CLIENT, verifiedForwardedClient } from './forwarded-client';
import { assertOrigin } from './origin';

@Injectable()
export class ApiAccessMiddleware implements NestMiddleware {
  private readonly limits = new RequestRateLimiter();

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Uses the web server's signed visitor address; anything unsigned or invalid stays on the socket address. */
  private client(req: SessionRequest) {
    const forwarded = verifiedForwardedClient(req.headers, this.config.forwardedClientKey);
    if (forwarded === INTERNAL_CLIENT) return { ip: INTERNAL_CLIENT, internal: true };
    return { ip: forwarded ?? req.ip ?? 'unknown', internal: false };
  }

  private enforceLimit(res: Response, { key, limit }: { key: string; limit: number }) {
    const retryAfter = this.limits.consume(key, limit);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      throw new ApiError(429, 'RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async use(req: SessionRequest, res: Response, next: NextFunction) {
    try {
      // Routing is case-sensitive, but any spelling the router could have matched must pass these checks.
      if (!req.path.toLowerCase().startsWith('/api')) return next();
      if (isHealthProbe(req)) return next();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertOrigin(req, this.config.webOrigin);
      const client = this.client(req);
      if (this.config.rateLimit) this.enforceLimit(res, coarseRateBucket(client));
      await this.sessions.loadSession(req);
      if (
        req.gfSession?.user?.bannedAt &&
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        !bannedUserMayWrite(req.method, req.path)
      )
        throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
      if (this.config.rateLimit)
        for (const bucket of requestRateBuckets({
          ...client,
          userId: req.gfSession?.user?.id,
          path: req.path,
          method: req.method,
        }))
          this.enforceLimit(res, bucket);
      next();
    } catch (error) {
      if (!(error instanceof ApiError)) return next(error);
      res.status(error.getStatus()).json(error.getResponse());
    }
  }
}
