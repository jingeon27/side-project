import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { DemoProfileProvider } from '../../game-profiles/providers/demo-profile.provider';
import { FORWARDED_CLIENT_HEADERS, forwardedClientKey, signForwardedClient } from './forwarded-client';

// Cookie-free session reads never touch the database, so the schema is never created.
const databaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=gf_test_forwarded_client';
const secret = 'test-only-forwarded-client-secret-'.repeat(2);
const anonymousReadLimit = 240;

function signed(client: string, signingSecret = secret, at = Math.floor(Date.now() / 1000)) {
  return {
    [FORWARDED_CLIENT_HEADERS.client]: client,
    [FORWARDED_CLIENT_HEADERS.timestamp]: String(at),
    [FORWARDED_CLIENT_HEADERS.signature]: signForwardedClient(forwardedClientKey(signingSecret), client, at),
  };
}

describe('rate limits for server-side rendering requests from one web container', () => {
  let app: INestApplication | undefined;
  async function start(forwardedClientSecret: string | undefined = secret) {
    app = await createApp({
      databaseUrl,
      webOrigin: 'http://localhost:3300',
      rateLimit: true,
      forwardedClientSecret,
      profileProvider: new DemoProfileProvider(),
    });
    return supertest(app.getHttpServer());
  }
  async function exhaust(request: ReturnType<typeof supertest>, headers: () => Record<string, string>) {
    for (let count = 0; count < anonymousReadLimit; count++)
      await request.get('/api/session').set(headers()).expect(200);
  }
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('keeps each signed visitor address in its own budget instead of the web container address', async () => {
    const request = await start();
    await exhaust(request, () => signed('203.0.113.7'));
    const limited = await request.get('/api/session').set(signed('203.0.113.7')).expect(429);
    expect(limited.body.errorCode).toBe('RATE_LIMITED');
    await request.get('/api/session').set(signed('198.51.100.9')).expect(200);
    await request.get('/api/session').set(signed('2001:db8::1')).expect(200);
    // Unsigned calls from the same socket were not charged for the visitor above.
    await request.get('/api/session').expect(200);
  });

  it('ignores forged, stale or differently keyed headers and charges the socket address', async () => {
    const request = await start();
    let index = 0;
    const forged = () => {
      index += 1;
      const variant = index % 3;
      if (variant === 0)
        return { ...signed('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.client]: `192.0.2.${index % 250}` };
      if (variant === 1) return signed(`192.0.2.${index % 250}`, `${secret}-other`);
      return signed(`192.0.2.${index % 250}`, secret, Math.floor(Date.now() / 1000) - 120);
    };
    await exhaust(request, forged);
    await request.get('/api/session').expect(429);
    await request.get('/api/session').set(signed('203.0.113.7')).expect(200);
  });

  it('gives signed internal reads their own larger budget', async () => {
    const request = await start();
    for (let count = 0; count < anonymousReadLimit + 60; count++)
      await request.get('/api/session').set(signed('internal')).expect(200);
    await exhaust(request, () => ({}));
    await request.get('/api/session').expect(429);
  });

  it('treats signatures as unverified when the API has no shared secret', async () => {
    const request = await start('');
    await exhaust(request, () => signed('203.0.113.7'));
    await request.get('/api/session').set(signed('198.51.100.9')).expect(429);
  });
});
