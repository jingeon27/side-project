import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ChatLifecycleMiddleware } from './chat/chat-lifecycle.middleware';
import { ApiAccessMiddleware } from './common/http/api-access.middleware';
import { configureHttp, createHttpAdapter } from './common/http/configure-http';
import type { AppOptions } from './config/app.config';

export type { AppOptions } from './config/app.config';

export async function createApp(options: AppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(options), createHttpAdapter(), {
    logger: options.logger ?? false,
    bodyParser: false,
  });
  configureHttp(app);
  const access = app.get(ApiAccessMiddleware);
  const chatLifecycle = app.get(ChatLifecycleMiddleware);
  app.use(access.use.bind(access));
  app.use(chatLifecycle.use.bind(chatLifecycle));
  await app.init();
  return app;
}
