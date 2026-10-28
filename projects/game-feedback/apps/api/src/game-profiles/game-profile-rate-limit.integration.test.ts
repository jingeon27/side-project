import supertest from 'supertest';
import { expect, it } from 'vitest';

import { createApp } from '../app';
import { GAME_PROFILE_LOOKUP_LIMIT } from '../rate-limit';
import { DemoProfileProvider } from './providers/demo-profile.provider';

// The limit is enforced before the session lookup's database query is needed, so the schema is never created.
const databaseUrl =
  'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test?schema=gf_test_game_profile_limit';
const origin = 'http://localhost:3300';

it('charges account saving and onboarding to the same Supercell lookup budget as the preview', async () => {
  const app = await createApp({
    databaseUrl,
    webOrigin: origin,
    rateLimit: true,
    profileProvider: new DemoProfileProvider(),
  });
  try {
    const request = supertest(app.getHttpServer());
    // Anonymous previews are refused by the guard but still spend the lookup budget of this address.
    for (const attempt of Array.from({ length: GAME_PROFILE_LOOKUP_LIMIT }, (_, index) => index + 1))
      expect((await request.get('/api/game-profiles/%23P0LYQ829')).status, `preview ${attempt}`).toBe(401);
    await request.get('/api/game-profiles/%23P0LYQ829').expect(429);
    for (const path of ['/api/me/game-accounts', '/api/auth/onboard']) {
      const limited = await request.post(path).set('Origin', origin).send({ playerTag: '#P0LYQ829' });
      expect(limited.status).toBe(429);
      expect(limited.body.errorCode).toBe('RATE_LIMITED');
      expect(limited.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);
    }
    // Ordinary writes from the same address keep their own budget.
    await request.post('/api/auth/logout').set('Origin', origin).expect(200);
  } finally {
    await app.close();
  }
});
