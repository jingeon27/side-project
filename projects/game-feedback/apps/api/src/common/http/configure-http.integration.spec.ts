import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureHttp, createHttpAdapter } from './configure-http';

@Module({})
class HttpFixtureModule {}

afterEach(() => vi.unstubAllEnvs());

const createFixture = async (environment: string) => {
  vi.stubEnv('ENVIRONMENT', environment);
  const app = await NestFactory.create(HttpFixtureModule, createHttpAdapter(), { logger: false });
  configureHttp(app);
  // 이후에 문서 제공자가 등록되어도 운영 HTTP 설정이 먼저 요청을 막아야 한다.
  app.use((_req: Request, res: Response) => res.json({ openapi: '3.1.0' }));
  await app.init();
  return app;
};

describe('운영 API 문서 접근', () => {
  it('운영에서는 UI·JSON·YAML·하위 자산·인코딩 경로를 404로 막아야 한다', async () => {
    const app = await createFixture('production');
    try {
      const http = request(app.getHttpServer());
      for (const pathname of [
        '/openapi.json',
        '/openapi.yaml',
        '/api/openapi.json',
        '/api/openapi.yml',
        '/docs',
        '/api/docs',
        '/api/docs-json',
        '/api-json',
        '/api-yaml',
        '/swagger',
        '/swagger-ui.html',
        '/api/swagger-ui/index.html',
        '/api-docs',
        '/API/OPENAPI.JSON',
        '/api/%64ocs?format=json',
      ]) {
        const response = await http.get(pathname).expect(404).expect('Cache-Control', 'no-store');
        expect(response.body).toEqual({ errorCode: 'NOT_FOUND', message: '요청을 처리할 수 없습니다.' });
      }
      await http.head('/api/openapi.json').expect(404);
      await http.post('/api/docs').send({}).expect(404);
      await http.get('/api/posts?search=swagger').expect(200);
    } finally {
      await app.close();
    }
  });

  it('개발 환경에서는 HTTP 설정이 문서 경로를 차단하지 않아야 한다', async () => {
    const app = await createFixture('development');
    try {
      const response = await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
      expect(response.body.openapi).toBe('3.1.0');
    } finally {
      await app.close();
    }
  });
});
