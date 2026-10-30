import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttp, createHttpAdapter } from './configure-http';

@Module({})
class CompressedBodyFixtureModule {}

describe('압축 JSON 요청 거절', () => {
  const state: { app?: INestApplication } = {};
  beforeAll(async () => {
    const app = await NestFactory.create(CompressedBodyFixtureModule, createHttpAdapter(), {
      logger: false,
      bodyParser: false,
    });
    configureHttp(app);
    app.use((req: Request, res: Response) => res.json({ body: req.body ?? null }));
    await app.init();
    state.app = app;
  });
  afterAll(async () => state.app?.close());

  it.each([
    { encoding: 'gzip', compress: gzipSync },
    { encoding: 'deflate', compress: deflateSync },
    { encoding: 'br', compress: brotliCompressSync },
  ])(
    '$encoding 본문과 뒤에 추가 바이트가 붙은 본문을 압축 해제 전에 거절해야 한다',
    async ({ encoding, compress }) => {
      if (!state.app) throw new Error('HTTP fixture must be initialized.');
      const http = request(state.app.getHttpServer());
      const compressed = compress(Buffer.from('{"value":"safe"}'));
      for (const body of [compressed, Buffer.concat([compressed, Buffer.from('trailing-bytes')])]) {
        const response = await http
          .post('/api/body-probe')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', encoding)
          .send(body)
          .expect(415);
        expect(response.body.errorCode).toBe('INVALID_BODY');
      }
      const healthy = await http.post('/api/body-probe').send({ value: 'safe' }).expect(200);
      expect(healthy.body.body).toEqual({ value: 'safe' });
    },
  );
});
