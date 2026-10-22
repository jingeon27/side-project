import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

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
  // Production API traffic enters through the single private reverse-proxy hop.
  // The container port is published only to host loopback for operator SSH tunnels.
  const server = app.getHttpAdapter().getInstance() as Express;
  server.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  server.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error) {
      res.status(error.type === 'entity.too.large' ? 413 : 400).json({
        errorCode: 'INVALID_BODY',
        message: '올바른 JSON 요청을 입력해주세요.',
      });
      return;
    }
    next(error);
  });
}
