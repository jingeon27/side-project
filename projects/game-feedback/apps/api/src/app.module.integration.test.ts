import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import { SessionService } from './auth/session/session.service';
import { ChatEvents } from './chat/chat.events';
import { createPrismaAdapter } from './database/prisma-adapter';
import { DemoProfileProvider } from './game-profiles/providers/demo-profile.provider';
import { PrismaClient } from './generated/prisma';

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
  it('serves health probes beyond both rate budgets without consuming the session read budget', async () => {
    const app = await createApp({ ...options, rateLimit: true });
    const sessions = vi.spyOn(app.get(SessionService), 'loadSession');
    try {
      const request = supertest(app.getHttpServer());
      for (let count = 0; count < 1001; count++) await request.get('/api/health/live').expect(200);
      await request.head('/api/health/live').expect(200);
      await request.get('/api/health/ready').expect(200);
      await request.get('/api/health').expect(200);
      expect(sessions).not.toHaveBeenCalled();
      for (let count = 0; count < 240; count++) await request.get('/api/session').expect(200);
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
    const client = new PrismaClient({ adapter: createPrismaAdapter(options.databaseUrl) });
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
