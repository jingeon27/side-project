import { describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from './app';
import { PrismaClient } from './generated/prisma';
import { ChatEvents } from './chat/chat.events';
import { DemoProfileProvider } from './game-profiles/providers/demo-profile.provider';

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
