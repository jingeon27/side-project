import express from 'express';
import supertest from 'supertest';
import { expect, it } from 'vitest';
import { requestIdentity } from './request-identity';

const secret = 'a'.repeat(64);
function server(configured?: string) {
  const app = express();
  app.get('/identity', (req, res) => res.json(requestIdentity(req, configured)));
  app.post('/identity', (req, res) => res.json(requestIdentity(req, configured)));
  return supertest(app);
}

it('uses socket identity when no secret is configured, even with forwarded headers', async () => {
  const request = server();
  const fallback = (await request.get('/identity')).body;
  const forged = await request
    .get('/identity')
    .set('x-game-feedback-proxy-secret', secret)
    .set('x-game-feedback-client-ip', '203.0.113.10')
    .set('X-Forwarded-For', '203.0.113.11');
  expect(forged.body).toEqual(fallback);
  expect(fallback.publicSsr).toBe(false);
});
it('does not grant a public-cache identity to writes or malformed visitor addresses', async () => {
  const request = server(secret);
  const fallback = (await request.get('/identity')).body;
  expect((await request.post('/identity').set('x-game-feedback-proxy-secret', secret)).body).toEqual(
    fallback,
  );
  const malformed = await request
    .get('/identity')
    .set('x-game-feedback-proxy-secret', secret)
    .set('x-game-feedback-client-ip', '203.0.113.10, 203.0.113.11');
  expect(malformed.body).toEqual(fallback);
  expect(
    (
      await request
        .get('/identity')
        .set('x-game-feedback-proxy-secret', secret)
        .set('x-game-feedback-client-ip', '2001:db8::10')
    ).body,
  ).toEqual({ ip: '2001:db8::10', publicSsr: false });
});
