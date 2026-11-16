import express, { type Request, type Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MEDIA_RATE_LIMIT_PER_WINDOW } from '../../config/limits';
import { isMediaPath, MEDIA_RATE_LIMITED, mediaRateLimit } from './media-rate-limit.middleware';

describe('mediaRateLimit 경로 우회 회귀', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '/MEDIA/post-1',
    '/Media/post-1/Download',
    '/PHOTOS/submission-1',
    '/GROUPS/group-1/AVATAR/avatar-1',
    '/profiles/user-1/Avatar/avatar-1',
    '/groups/group-1/cover/cover-1',
    '/Groups/group-1/COVER/cover-1/',
  ])('라우팅 가능한 미디어 경로 %s를 요청 한도에 포함해야 한다', (path) => {
    expect(isMediaPath(path)).toBe(true);
  });

  it('실제 Express 라우팅에서 대소문자와 배경 경로를 바꾸어도 같은 주소의 한도를 공유해야 한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = express();
    app.use(mediaRateLimit());
    app.get('/media/:id', (_req, res) => res.sendStatus(204));
    app.get('/groups/:id/cover/:coverId', (_req, res) => res.sendStatus(204));
    const open = (path: string) =>
      new Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>((resolve, reject) => {
        const headers: Record<string, string> = {};
        const req: Partial<Request> = {
          method: 'GET',
          url: path,
          path,
          ip: '203.0.113.43',
          headers: { 'x-forwarded-for': '203.0.113.43' },
        };
        const res = {
          statusCode: 200,
          setHeader(name: string, value: string) {
            headers[name] = value;
          },
          status(status: number) {
            this.statusCode = status;
            return this;
          },
          json(body: unknown) {
            resolve({ status: this.statusCode, body, headers });
          },
          sendStatus(status: number) {
            resolve({ status });
          },
        };
        app.router(req as Request, res as Response, (error?: unknown) => {
          if (error) return reject(error);
          resolve({ status: 404 });
        });
      });
    for (const index of Array.from({ length: MEDIA_RATE_LIMIT_PER_WINDOW }, (_, index) => index)) {
      expect((await open(index % 2 ? '/MEDIA/post-1' : '/groups/group-1/cover/cover-1')).status).toBe(204);
    }
    for (const path of ['/media/post-1', '/MEDIA/post-1', '/groups/group-1/cover/cover-1']) {
      const response = await open(path);
      expect(response.status).toBe(429);
      expect(response.body).toEqual({ message: MEDIA_RATE_LIMITED });
      expect(Number(response.headers?.['Retry-After'])).toBeGreaterThan(0);
    }
  });
});
