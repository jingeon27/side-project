import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import type { AppOptions } from './config/app.config';
import { configureHttp } from './common/http/configure-http';
import { ApiAccessMiddleware } from './common/http/api-access.middleware';
import { ChatLifecycleMiddleware } from './chat/chat-lifecycle.middleware';

export type { AppOptions } from './config/app.config';

export async function createApp(options: AppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(options), {
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
