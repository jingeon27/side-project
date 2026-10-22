import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { bodyParserErrorHandler } from './common/http/body-parser-error.middleware';
import { noStore } from './common/http/no-store.middleware';
import { originGuard } from './common/http/origin-guard.middleware';
import { assertProductionConfig, assertTestingConfig, isTest, trustedProxyHops } from './config/env';
import { MAX_JSON_BODY } from './config/limits';

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log'];

export interface ICreateAppOptions {
  /** 지정하지 않으면 NODE_ENV=test에서만 로그를 끈다. */
  logger?: false | LogLevel[];
}

/**
 * 미들웨어와 필터만 연결하고 listen은 하지 않는다(테스트는 app.getHttpServer()에 직접 요청한다).
 * 순서: no-store → Origin 검사(본문을 읽기 전에 거절) → JSON 본문 파서 → 파서 오류 응답. 파일은 저장소로 직접 보낸다.
 */
export async function createApp({ logger }: ICreateAppOptions = {}): Promise<INestApplication> {
  assertTestingConfig();
  assertProductionConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: logger ?? (isTest() ? false : LOG_LEVELS),
  });
  // 운영에서는 외부에 포트를 열지 않고 Caddy 한 단계가 전달한 주소만 사용한다.
  app.set('trust proxy', trustedProxyHops());
  app.use(noStore);
  app.use(originGuard);
  app.use(json({ limit: MAX_JSON_BODY }));
  app.use(bodyParserErrorHandler);
  app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
  app.enableShutdownHooks();
  await app.init();
  return app;
}
