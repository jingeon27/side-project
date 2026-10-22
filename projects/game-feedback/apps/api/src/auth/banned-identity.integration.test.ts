import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionSchema, SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { createApp } from '../app';
import { hash, token } from '../common/crypto';
import { assertDatabaseUrl } from '../database/database-url';
import { PrismaClient } from '../generated/prisma';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type TAgent = ReturnType<typeof supertest.agent>;

describe('banned social identities after account deletion', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let schema: string;
  let admin: TAgent;

  // The fake provider returns the authorization code as the external subject.
  async function startSocial(agent: TAgent, provider: TSocialProvider, query: Record<string, string> = {}) {
    const start = await agent.get(`/api/auth/social/${provider}`).query(query).expect(302);
    return new URL(start.headers.location).searchParams.get('state') ?? '';
  }
  async function signUp(provider: TSocialProvider, subject: string, nickname: string) {
    const agent = supertest.agent(app.getHttpServer());
    const state = await startSocial(agent, provider);
    await agent.get(`/api/auth/social/${provider}/callback`).query({ state, code: subject }).expect(302);
    const response = await agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname, acceptedTerms: true, ageConfirmed: true })
      .expect(200);
    const user = SessionSchema.parse(response.body).user;
    if (!user) throw new Error('Expected an onboarded user.');
    return { agent, id: user.id };
  }
  function ban(id: string, banned: boolean) {
    return admin
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .send({ banned, reason: banned ? '반복된 사기 신고 확인' : '문의 확인 후 해제' })
      .expect(200);
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    schema = `gf_test_banned_identity_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(`Migration deployment failed: ${result.stderr}\n${result.stdout}`);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, true);
    const identityProviders = Object.fromEntries(
      SocialProviderSchema.options.map((provider) => [
        provider,
        {
          authorizationUrl: ({ state }: { state: string; nonce: string; challenge: string }) =>
            `https://${provider}.example.test/authorize?state=${state}`,
          exchange: async (code: string) => code,
        },
      ]),
    );
    app = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: false,
      testAuthEnabled: true,
      identityProviders,
      rateLimit: false,
      prisma: db,
    });
    admin = supertest.agent(app.getHttpServer());
    await admin
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'sample-test-admin' })
      .expect(200);
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_banned_identity_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema.');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('refuses a new signup with the same social login after a banned user deletes the account', async () => {
    const banned = await signUp('x', 'x-banned-subject', '탈퇴밴사용자');
    await ban(banned.id, true);
    expect(await db.bannedIdentity.count({ where: { userId: banned.id } })).toBe(1);
    // The banned account itself can still sign in to reach support.
    const returning = supertest.agent(app.getHttpServer());
    const state = await startSocial(returning, 'x');
    await returning.get('/api/auth/social/x/callback').query({ state, code: 'x-banned-subject' }).expect(302);
    expect(SessionSchema.parse((await returning.get('/api/session')).body).user?.id).toBe(banned.id);

    await banned.agent.delete('/api/me').set('Origin', origin).expect(200);
    expect(await db.user.findUnique({ where: { id: banned.id } })).toBeNull();
    expect(
      await db.bannedIdentity.findUnique({
        where: { provider_subjectHash: { provider: 'x', subjectHash: hash('x-banned-subject') } },
      }),
    ).not.toBeNull();

    const web = supertest.agent(app.getHttpServer());
    const webState = await startSocial(web, 'x');
    const rejected = await web
      .get('/api/auth/social/x/callback')
      .query({ state: webState, code: 'x-banned-subject' })
      .expect(403);
    expect(rejected.body.errorCode).toBe('USER_BANNED');
    expect(SessionSchema.parse((await web.get('/api/session')).body).needsOnboarding).toBe(false);

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const native = supertest.agent(app.getHttpServer());
    const nativeState = await startSocial(native, 'x', { app_challenge: challenge });
    const callback = await native
      .get('/api/auth/social/x/callback')
      .query({ state: nativeState, code: 'x-banned-subject' })
      .expect(302);
    expect(callback.headers.location).toBe('gamefeedback://auth/callback?error=login_failed');

    // Subjects are never merged across providers, so the same value elsewhere is a different identity.
    await signUp('discord', 'x-banned-subject', '다른제공자사용자');
  });

  it('checks the native code exchange and onboarding as well as the callback', async () => {
    await db.bannedIdentity.create({
      data: { provider: 'kakao', subjectHash: hash('kakao-banned-subject'), userId: 'deleted-user' },
    });
    const verifier = randomBytes(32).toString('base64url');
    const code = token();
    await db.appLoginTicket.create({
      data: {
        codeHash: hash(code),
        challenge: createHash('sha256').update(verifier).digest('base64url'),
        subject: 'kakao-banned-subject',
        provider: 'kakao',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const exchange = await supertest(app.getHttpServer())
      .post('/api/auth/app/exchange')
      .set('Origin', origin)
      .send({ code, verifier })
      .expect(403);
    expect(exchange.body.errorCode).toBe('USER_BANNED');

    const raw = token();
    await db.session.create({
      data: {
        tokenHash: hash(raw),
        pendingSubject: 'kakao-banned-subject',
        pendingProvider: 'kakao',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const before = await db.user.count();
    await supertest(app.getHttpServer())
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${raw}`)
      .send({ nickname: '우회가입시도', acceptedTerms: true, ageConfirmed: true })
      .expect(403);
    expect(await db.user.count()).toBe(before);
  });

  it('removes the record when an administrator lifts the ban', async () => {
    const released = await signUp('google', 'google-released-subject', '해제될사용자');
    await ban(released.id, true);
    expect(await db.bannedIdentity.count({ where: { userId: released.id } })).toBe(1);
    await ban(released.id, false);
    expect(await db.bannedIdentity.count({ where: { userId: released.id } })).toBe(0);
    await released.agent.delete('/api/me').set('Origin', origin).expect(200);
    await signUp('google', 'google-released-subject', '다시가입한사용자');
  });
});
