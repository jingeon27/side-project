import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { match } from 'ts-pattern';

import { traceHttpRequest } from '../../monitoring/http-performance.middleware';
import { productionApiDocs } from './production-api-docs.middleware';
import { RequestValidationPipe } from './request-validation';

/**
 * Express 5 matches routes case-insensitively, so `/API/posts` would reach a controller while the
 * path-based access middleware and rate buckets treat it as another path. The router reads this flag
 * once, when the first middleware creates it, and `ExpressAdapter`'s constructor already adds one.
 */
export function createHttpAdapter() {
  const server = express();
  server.set('case sensitive routing', true);
  return new ExpressAdapter(server);
}

export function configureHttp(app: INestApplication) {
  app.useGlobalPipes(new RequestValidationPipe());
  app.use(traceHttpRequest);
  // Production API traffic enters through the single private reverse-proxy hop.
  // The container port is published only to host loopback for operator SSH tunnels.
  const server = app.getHttpAdapter().getInstance() as Express;
  const production = process.env.ENVIRONMENT === 'production';
  server.set('trust proxy', production ? 1 : false);
  server.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  if (production) app.use(productionApiDocs);
  // 클라이언트는 JSON을 그대로 보내므로 요청 압축 해제 스트림을 만들지 않는다.
  app.use(express.json({ limit: '256kb', inflate: false }));
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error) {
      const status = match(error.type)
        .with('entity.too.large', () => 413)
        .with('encoding.unsupported', () => 415)
        .otherwise(() => 400);
      res.status(status).json({
        errorCode: 'INVALID_BODY',
        message: '올바른 JSON 요청을 입력해주세요.',
      });
      return;
    }
    next(error);
  });
}
