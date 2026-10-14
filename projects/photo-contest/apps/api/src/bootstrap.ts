import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { bodyParserErrorHandler } from './common/http/body-parser-error.middleware';
import { noStore } from './common/http/no-store.middleware';
import { originGuard } from './common/http/origin-guard.middleware';
import { assertProductionConfig, isTest } from './config/env';
import { MAX_JSON_BODY, MAX_UPLOAD_BODY } from './config/limits';

const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log'];

export interface ICreateAppOptions {
  /** 지정하지 않으면 NODE_ENV=test에서만 로그를 끈다. */
  logger?: false | LogLevel[];
}

/**
 * 미들웨어와 필터만 연결하고 listen은 하지 않는다(테스트는 app.getHttpServer()에 직접 요청한다).
 * 순서: no-store → Origin 검사(본문을 읽기 전에 거절) → 본문 파서(/uploads만 raw) → 파서 오류 응답.
 */
export async function createApp({ logger }: ICreateAppOptions = {}): Promise<INestApplication> {
  assertProductionConfig();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: logger ?? (isTest() ? false : LOG_LEVELS),
  });
  app.use(noStore);
  app.use(originGuard);
  app.use('/uploads', raw({ type: UPLOAD_CONTENT_TYPES, limit: MAX_UPLOAD_BODY }));
  app.use(json({ limit: MAX_JSON_BODY }));
  app.use(bodyParserErrorHandler);
  app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
  app.enableShutdownHooks();
  await app.init();
  return app;
}
