import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { bodyParserErrorHandler } from './common/http/body-parser-error.middleware';
import { graphqlRateLimit } from './common/http/graphql-rate-limit.middleware';
import { mediaRateLimit } from './common/http/media-rate-limit.middleware';
import { noStore } from './common/http/no-store.middleware';
import { originGuard } from './common/http/origin-guard.middleware';
import { createInputValidationPipe } from './common/input-validation';
import { assertProductionConfig, isTest, trustedProxyHops } from './config/env';
import { MAX_JSON_BODY } from './config/limits';
import { traceHttpRequest } from './monitoring/http-performance.middleware';
import { TestingModule } from './testing/testing.module';

const LOG_LEVELS = ['error', 'warn', 'log'] satisfies LogLevel[];

export interface ICreateAppOptions {
  testFixtures?: boolean;
  /** 지정하지 않으면 NODE_ENV=test에서만 로그를 끈다. */
  logger?: false | LogLevel[];
  /** 외부 실행기가 종료와 자원 정리를 맡으면 false로 지정한다. */
  shutdownHooks?: boolean;
}

/**
 * 미들웨어와 필터만 연결하고 listen은 하지 않는다(테스트는 app.getHttpServer()에 직접 요청한다).
 * 순서: no-store → Origin 검사(본문을 읽기 전에 거절) → 운영 GraphQL·고정 미디어 경로의 주소별 요청 제한 → JSON 본문 파서
 * → 파서 오류 응답.
 * 파일은 저장소로 직접 보낸다.
 */
export async function createApp({
  logger,
  testFixtures = false,
  shutdownHooks = true,
}: ICreateAppOptions = {}): Promise<INestApplication> {
  assertProductionConfig();
  if (testFixtures && !isTest()) throw new Error('Test fixtures require NODE_ENV=test.');
  const module = testFixtures ? { module: AppModule, imports: [TestingModule] } : AppModule;
  const app = await NestFactory.create<NestExpressApplication>(module, {
    bodyParser: false,
    logger: logger ?? (isTest() ? false : LOG_LEVELS),
  });
  // 운영에서는 외부에 포트를 열지 않고 Caddy 한 단계가 전달한 주소만 사용한다.
  app.set('trust proxy', trustedProxyHops());
  app.use(traceHttpRequest);
  app.use(noStore);
  app.use(originGuard);
  app.use('/graphql', graphqlRateLimit());
  app.use(mediaRateLimit());
  // 클라이언트는 JSON을 그대로 보내므로 요청 압축 해제 스트림을 만들지 않는다.
  app.use(json({ limit: MAX_JSON_BODY, inflate: false }));
  app.use(bodyParserErrorHandler);
  app.useGlobalPipes(createInputValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter(app.getHttpAdapter()));
  if (shutdownHooks) app.enableShutdownHooks();
  await app.init();
  return app;
}
