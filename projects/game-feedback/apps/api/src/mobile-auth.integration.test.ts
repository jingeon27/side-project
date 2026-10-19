import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import { createApp } from './app';
import { assertDatabaseUrl, hash } from './security';

const baseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);
describe.skipIf(!baseUrl)('mobile OAuth handoff with isolated PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let schema: string;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  async function issue(subject = 'mobile-existing') {
    const browser = supertest.agent(app.getHttpServer());
    const start = await browser.get(`/api/auth/google?app_challenge=${challenge}`).expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    const result = await browser.get('/api/auth/google/callback').query({ state, code: subject }).expect(302);
    expect(result.headers.location).toMatch(/^gamefeedback:\/\/auth\/callback\?code=[A-Za-z0-9_-]{43}$/);
    const rawCookies = result.headers['set-cookie'] as unknown as string[];
    expect(rawCookies.some((cookie) => cookie.startsWith('gamefeedback_session='))).toBe(false);
    const code = new URL(result.headers.location).searchParams.get('code');
    if (!code) throw new Error('Missing app ticket');
    return { code, verifier };
  }
  const exchange = (body: unknown, agent = supertest.agent(app.getHttpServer())) =>
    agent.post('/api/auth/app/exchange').set('Origin', origin).send(body);
  beforeAll(async () => {
    if (!baseUrl) throw new Error('Missing isolated test DB');
    const target = new URL(baseUrl);
    schema = `gf_test_mobile_auth_${randomBytes(8).toString('hex')}`;
    target.searchParams.set('schema', schema);
    const url = assertDatabaseUrl(target.toString(), 'test');
    const migrated = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url }, encoding: 'utf8' },
    );
    if (migrated.status !== 0) throw new Error(migrated.stderr + migrated.stdout);
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.create({
      data: {
        googleSubject: 'mobile-existing',
        nickname: '앱사용자',
        ageConfirmed: true,
        termsVersion: 'test',
      },
    });
    app = await createApp({
      databaseUrl: url,
      webOrigin: origin,
      prisma: db,
      rateLimit: false,
      demoMode: false,
      identityProvider: {
        authorizationUrl: ({ state }) => `https://identity.invalid/authorize?state=${state}`,
        exchange: async (code) => {
          if (code === 'failure') throw new Error('Fake provider failure');
          return code;
        },
      },
    });
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  it('issues a hashed ticket and exchanges it for a WebView HttpOnly cookie exactly once', async () => {
    const body = await issue();
    const stored = await db.appLoginTicket.findUniqueOrThrow({ where: { codeHash: hash(body.code) } });
    expect(stored.challenge).toBe(challenge);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(120_000);
    const webview = supertest.agent(app.getHttpServer());
    const result = await exchange(body, webview).expect(200);
    expect(result.body.user.nickname).toBe('앱사용자');
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await webview.get('/api/session').expect(200)).body.user.nickname).toBe('앱사용자');
    await exchange(body).expect(400);
  });
  it('rejects wrong PKCE, untrusted origins and malformed payloads without consuming a valid ticket', async () => {
    const body = await issue();
    await exchange({ ...body, verifier: randomBytes(32).toString('base64url') }).expect(400);
    await supertest(app.getHttpServer()).post('/api/auth/app/exchange').send(body).expect(403);
    await supertest(app.getHttpServer())
      .post('/api/auth/app/exchange')
      .set('Origin', 'https://evil.invalid')
      .send(body)
      .expect(403);
    await exchange({ ...body, userId: 'forged' }).expect(400);
    await exchange(body).expect(200);
  });
  it('rejects expired tickets and permits only one concurrent exchange', async () => {
    const expired = await issue();
    await db.appLoginTicket.update({
      where: { codeHash: hash(expired.code) },
      data: { expiresAt: new Date(0) },
    });
    await exchange(expired).expect(400);
    const body = await issue();
    const results = await Promise.all([exchange(body), exchange(body)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  });
  it('keeps new Google users in onboarding until explicit consent', async () => {
    const webview = supertest.agent(app.getHttpServer());
    const result = await exchange(await issue('new-mobile-subject'), webview).expect(200);
    expect(result.body).toMatchObject({ user: null, needsOnboarding: true });
    await webview
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname: '새앱사용자', acceptedTerms: true, ageConfirmed: false })
      .expect(400);
    const joined = await webview
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname: '새앱사용자', acceptedTerms: true, ageConfirmed: true })
      .expect(200);
    expect(joined.body.user.nickname).toBe('새앱사용자');
  });
  it('rejects invalid app challenges and returns a fixed callback on provider failure', async () => {
    await supertest(app.getHttpServer()).get('/api/auth/google?app_challenge=bad').expect(400);
    const browser = supertest.agent(app.getHttpServer());
    const start = await browser.get(`/api/auth/google?app_challenge=${challenge}`).expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    await browser.get('/api/auth/google/callback').query({ state: 'forged', code: 'failure' }).expect(400);
    const failed = await browser
      .get('/api/auth/google/callback')
      .query({ state, code: 'failure' })
      .expect(302);
    expect(failed.headers.location).toBe('gamefeedback://auth/callback?error=login_failed');
    await browser.get('/api/auth/google/callback').query({ state, code: 'failure' }).expect(400);
  });
});
