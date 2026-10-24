import { describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from './app';
import { PrismaClient } from './generated/prisma';
import { ChatEvents } from './chat/chat.events';
import { DemoProfileProvider } from './game-profiles/providers/demo-profile.provider';
import { SessionService } from './auth/session.service';

const options = {
  databaseUrl:
    'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=gf_test_app_lifecycle',
  webOrigin: 'http://localhost:3300',
  rateLimit: false,
  identityProvider: {
    authorizationUrl: () => 'https://identity.invalid/authorize',
    exchange: async () => 'fake-subject',
  },
  profileProvider: new DemoProfileProvider(),
};

describe('application module composition and shutdown', () => {
  it('keeps anonymous SSR visitors in separate budgets behind the same web connection', async () => {
    const secret = 'a'.repeat(64);
    const app = await createApp({ ...options, rateLimit: true, proxySecret: secret });
    try {
      const request = supertest(app.getHttpServer());
      const visit = (ip: string) =>
        request
          .get('/api/session')
          .set('x-game-feedback-proxy-secret', secret)
          .set('x-game-feedback-client-ip', ip);
      for (const _ of Array.from({ length: 240 })) await visit('203.0.113.10').expect(200);
      await visit('203.0.113.10').expect(429);
      await visit('203.0.113.11').expect(200);
      // A cache fill has no visitor/cookie and must not consume either visitor's budget.
      for (const _ of Array.from({ length: 2400 }))
        await request.get('/api/session').set('x-game-feedback-proxy-secret', secret).expect(200);
      await request.get('/api/session').set('x-game-feedback-proxy-secret', secret).expect(429);
      await visit('203.0.113.11').expect(200);
    } finally {
      await app.close();
    }
  });
  it('cannot reset the anonymous budget with forged internal headers or X-Forwarded-For', async () => {
    const app = await createApp({ ...options, rateLimit: true, proxySecret: 'a'.repeat(64) });
    try {
      const request = supertest(app.getHttpServer());
      for (const index of Array.from({ length: 240 }, (_, index) => index))
        await request
          .get('/api/session')
          .set('x-game-feedback-proxy-secret', 'b'.repeat(64))
          .set('x-game-feedback-client-ip', `203.0.113.${index + 1}`)
          .set('X-Forwarded-For', `198.51.100.${index + 1}`)
          .expect(200);
      await request.get('/api/session').set('X-Forwarded-For', '192.0.2.1').expect(429);
      await request.get('/api/session').set('x-game-feedback-client-ip', '192.0.2.2').expect(429);
    } finally {
      await app.close();
    }
  });
  it('serves health probes beyond both rate budgets without consuming the session read budget', async () => {
    const app = await createApp({ ...options, rateLimit: true });
    const sessions = vi.spyOn(app.get(SessionService), 'loadSession');
    try {
      const request = supertest(app.getHttpServer());
      for (const _ of Array.from({ length: 1001 })) await request.get('/api/health/live').expect(200);
      await request.head('/api/health/live').expect(200);
      await request.get('/api/health/ready').expect(200);
      await request.get('/api/health').expect(200);
      expect(sessions).not.toHaveBeenCalled();
      for (const _ of Array.from({ length: 240 })) await request.get('/api/session').expect(200);
      await request.get('/api/session').expect(429);
    } finally {
      sessions.mockRestore();
      await app.close();
    }
  });
  it('keeps HTTP rate limiting enabled when the application is not using the test override', async () => {
    const app = await createApp({ ...options, rateLimit: true });
    try {
      const request = supertest(app.getHttpServer());
      for (const index of Array.from({ length: 240 }, (_, index) => index)) {
        void index;
        await request.get('/api/session').expect(200);
      }
      await request
        .get('/api/session')
        .expect(429)
        .expect('Retry-After', /^[1-9][0-9]*$/);
    } finally {
      await app.close();
    }
  });
  it('keeps configuration and session routes isolated between app instances', async () => {
    const demo = await createApp({ ...options, demoMode: true });
    const standard = await createApp({ ...options, demoMode: false });
    try {
      expect((await supertest(demo.getHttpServer()).get('/api/session').expect(200)).body.demoMode).toBe(
        true,
      );
      expect((await supertest(standard.getHttpServer()).get('/api/session').expect(200)).body.demoMode).toBe(
        false,
      );
    } finally {
      await Promise.all([demo.close(), standard.close()]);
    }
  });

  it('leaves a caller-owned Prisma connection open when the app closes', async () => {
    const client = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
    const disconnect = vi.spyOn(client, '$disconnect');
    try {
      const app = await createApp({ ...options, prisma: client });
      await app.close();
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      disconnect.mockRestore();
      await client.$disconnect();
    }
  });

  it('closes realtime clients before disconnecting an app-owned database', async () => {
    const app = await createApp(options);
    const client = app.get(PrismaClient);
    const calls: string[] = [];
    const closeStreams = vi.spyOn(app.get(ChatEvents), 'closeAll').mockImplementation(() => {
      calls.push('chat');
    });
    const disconnect = vi.spyOn(client, '$disconnect').mockImplementation(async () => {
      calls.push('database');
    });
    try {
      await app.close();
      expect(calls).toEqual(['chat', 'database']);
    } finally {
      closeStreams.mockRestore();
      disconnect.mockRestore();
      await client.$disconnect();
    }
  });
});
