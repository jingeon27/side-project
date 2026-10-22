import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { DemoProfileProvider } from '../../game-profiles/providers/demo-profile.provider';

// None of these requests reach the database: they are rejected by the access middleware or the router.
const databaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=gf_test_case_routes';
const origin = 'http://localhost:3300';

describe('API paths that differ only by letter case', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: true,
      rateLimit: true,
      profileProvider: new DemoProfileProvider(),
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('does not route upper- or mixed-case API paths to controllers', async () => {
    const request = supertest(app.getHttpServer());
    await request.get('/API/posts').expect(404);
    await request.get('/Api/Posts').expect(404);
    await request.get('/api/Posts').expect(404);
    await request.get('/API/session').expect(404);
    await request.get('/api/Auth/social/google').expect(404);
    await request.post('/api/Auth/demo').set('Origin', origin).send({ nickname: 'casevariant' }).expect(404);
    await request.get('/api/session').expect(200);
  });

  it('still applies Origin checks to case variants before routing', async () => {
    const request = supertest(app.getHttpServer());
    const rejected = await request.post('/API/posts').send({}).expect(403);
    expect(rejected.body.errorCode).toBe('INVALID_ORIGIN');
    await request.post('/Api/Auth/demo').set('Origin', 'https://outside.test').send({}).expect(403);
  });

  it('counts case variants against the same anonymous rate budget', async () => {
    const limited = await createApp({
      databaseUrl,
      webOrigin: origin,
      rateLimit: true,
      profileProvider: new DemoProfileProvider(),
    });
    try {
      const target = supertest(limited.getHttpServer());
      for (const _ of Array.from({ length: 240 })) await target.get('/API/posts').expect(404);
      const response = await target.get('/api/session').expect(429);
      expect(response.body.errorCode).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });
});
