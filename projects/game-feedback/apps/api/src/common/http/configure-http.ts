import express, { type NextFunction, type Request, type Response } from 'express';
import type { INestApplication } from '@nestjs/common';

export function configureHttp(app: INestApplication) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
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
