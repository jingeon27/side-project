import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { json, raw } from 'express';
import cookieParser from 'cookie-parser';
import { GraphQLError } from 'graphql';
import { AppModule } from './app.module';
import { webOrigin } from './auth.service';
@Catch(GraphQLError)
class HttpGraphqlFilter implements ExceptionFilter {
  catch(error: GraphQLError, host: ArgumentsHost) {
    if (host.getType<string>() === 'graphql') return error;
    const codes: Record<string, number> = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      UNAVAILABLE: 503,
    };
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(codes[String(error.extensions.code)] ?? 400)
      .json({ message: error.message });
  }
}
export async function createApp() {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.WEB_ORIGIN?.startsWith('https://') ||
      !process.env.DATABASE_URL ||
      !(process.env.STORAGE_BACKEND === 's3' ? process.env.S3_BUCKET : process.env.STORAGE_DIR))
  )
    throw new Error('Production requires HTTPS WEB_ORIGIN, DATABASE_URL and persistent STORAGE_DIR.');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== webOrigin()) {
      res.status(403).json({ message: '허용되지 않은 요청 출처입니다.' });
      return;
    }
    next();
  });
  app.use('/uploads', raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }));
  app.use(json({ limit: '64kb' }));
  app.useGlobalFilters(new HttpGraphqlFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
