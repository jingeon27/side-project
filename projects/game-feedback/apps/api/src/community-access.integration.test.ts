import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { SocialProviderSchema } from '@game-feedback/contracts';
import { PrismaClient } from './generated/prisma';
import { createApp } from './app';
import { seed } from './seed';
import { assertDatabaseUrl, DemoProfileProvider } from './security';
import { hash } from './common/crypto';
import { resolveAppConfig } from './config/app.config';

const target = process.env.TEST_DATABASE_URL;
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const state: { app?: INestApplication; normal?: INestApplication; db?: PrismaClient; schema?: string } = {};
function fixture() {
  if (!state.app || !state.db) throw new Error('Test application is not initialized.');
  return { app: state.app, db: state.db, request: supertest(state.app.getHttpServer()) };
}
async function account(accountId: string) {
  const agent = supertest.agent(fixture().app.getHttpServer());
  await agent.post('/api/auth/test-token').set('Origin', origin).send({ accountId }).expect(200);
  return agent;
}

describe.skipIf(!target)('public community, test tokens, follows and social identities', () => {
  beforeAll(async () => {
    const url = new URL(target ?? '');
    state.schema = `gf_test_access_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', state.schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0) throw new Error('Isolated community migration failed.');
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    state.db = db;
    await seed(db, true);
    const identityProviders = Object.fromEntries(
      SocialProviderSchema.options.map((provider) => [
        provider,
        {
          authorizationUrl: ({
            state: oauthState,
            challenge,
          }: {
            state: string;
            nonce: string;
            challenge: string;
          }) => `https://${provider}.example.test/authorize?state=${oauthState}&code_challenge=${challenge}`,
          exchange: async () => 'same-external-subject',
        },
      ]),
    );
    state.app = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: false,
      testAuthEnabled: true,
      identityProviders,
      profileProvider: new DemoProfileProvider(),
      rateLimit: false,
      prisma: db,
    });
    state.normal = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: false,
      testAuthEnabled: false,
      rateLimit: false,
      prisma: db,
    });
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    await state.normal?.close();
    if (!state.db) return;
    if (!state.schema || !/^gf_test_access_[a-f0-9]+$/.test(state.schema)) throw new Error('Unowned schema.');
    await state.db.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
    await state.db.$disconnect();
  });

  it('issues an expiring opaque bearer token, also sets a web session, and revokes it on logout', async () => {
    const { request, db } = fixture();
    const issued = await request
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-0' })
      .expect(200);
    expect(issued.body.tokenType).toBe('Bearer');
    expect(issued.body.user.id).toBe('sample-user-0');
    expect(issued.headers['cache-control']).toBe('no-store');
    expect(String(issued.headers['set-cookie'])).toContain('HttpOnly');
    const raw: string = issued.body.accessToken;
    const session = await db.session.findUniqueOrThrow({ where: { tokenHash: hash(raw) } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
    await request.get('/api/notifications').set('Authorization', `Bearer ${raw}`).expect(200);
    await request.get('/api/notifications').set('Authorization', 'Bearer invalid').expect(401);
    await request
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${raw}`)
      .expect(200);
    await request.get('/api/notifications').set('Authorization', `Bearer ${raw}`).expect(401);
    const expired = await request
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-3' })
      .expect(200);
    await db.session.update({
      where: { tokenHash: hash(expired.body.accessToken) },
      data: { expiresAt: new Date(0) },
    });
    await request
      .get('/api/notifications')
      .set('Authorization', `Bearer ${expired.body.accessToken}`)
      .expect(401);
  });

  it('limits token issuance to explicitly enabled testing and predefined accounts', async () => {
    const { request } = fixture();
    if (!state.normal) throw new Error('Normal application missing.');
    await supertest(state.normal.getHttpServer())
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-0' })
      .expect(404);
    await request
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'not-a-fixture' })
      .expect(404);
    await request
      .post('/api/auth/test-token')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-0', role: 'ADMIN' })
      .expect(400);
    await request
      .post('/api/auth/test-token')
      .set('Origin', 'https://evil.example')
      .send({ accountId: 'sample-user-0' })
      .expect(403);
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => resolveAppConfig({ demoMode: false, testAuthEnabled: true })).toThrow(
        'GF_TEST_AUTH_ENABLED',
      );
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  it('exposes all five boards, their bodies and comments without authentication', async () => {
    const { request } = fixture();
    for (const board of ['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE']) {
      const response = await request.get('/api/posts').query({ board }).expect(200);
      expect(response.body.items.length).toBeGreaterThan(0);
      const detail = await request.get(`/api/posts/${response.body.items[0].id}`).expect(200);
      expect(detail.body.post.body.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(detail.body.post.createdAt))).toBe(false);
      expect(detail.body.post.viewCount).toBeGreaterThanOrEqual(0);
    }
    const detail = await request.get('/api/posts/sample-post-0').expect(200);
    expect(detail.body.comments.length).toBeGreaterThan(0);
  });

  it('counts a public visit once per visitor for 24 hours, including concurrent retries', async () => {
    const { request, db } = fixture();
    const id = 'sample-post-0';
    const visitorId = randomUUID();
    const before = await db.post.findUniqueOrThrow({ where: { id } });
    const visits = await Promise.all(
      Array.from({ length: 5 }, () =>
        request.post(`/api/posts/${id}/views`).set('Origin', origin).send({ visitorId }).expect(200),
      ),
    );
    expect(visits.every((response) => response.body.viewCount === 1)).toBe(true);
    await request
      .post(`/api/posts/${id}/views`)
      .set('Origin', origin)
      .send({ visitorId: randomUUID() })
      .expect(200, { viewCount: 2 });
    await db.postView.update({
      where: { postId_visitorHash: { postId: id, visitorHash: hash(`visitor:${visitorId}`) } },
      data: { lastViewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    await request
      .post(`/api/posts/${id}/views`)
      .set('Origin', origin)
      .send({ visitorId })
      .expect(200, { viewCount: 3 });
    await request.post(`/api/posts/${id}/views`).set('Origin', origin).send({ visitorId: 'bad' }).expect(400);
    expect((await db.post.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(before.updatedAt);
  });

  it('follows once, sends an atomic new post alert, and respects mute and unfollow', async () => {
    const { db } = fixture();
    const follower = await account('sample-user-0');
    const author = await account('sample-user-3');
    const path = '/api/users/sample-user-3/follow';
    await follower.get(path).expect(200, { following: false, notifyNewPosts: false });
    for (const repeat of [0, 1]) {
      void repeat;
      await follower.put(path).set('Origin', origin).send({ notifyNewPosts: true }).expect(200);
    }
    expect(
      await db.userFollow.count({ where: { followerId: 'sample-user-0', followingId: 'sample-user-3' } }),
    ).toBe(1);
    const publish = () =>
      author
        .post('/api/posts')
        .set('Origin', origin)
        .send({
          title: `새 소식 ${randomUUID()}`,
          body: '함께 연습할 분을 구해요.',
          categoryId: 'clash-royale',
          board: 'FREE',
        })
        .expect(200);
    const post = (await publish()).body;
    const notices = (await follower.get('/api/notifications').expect(200)).body;
    expect(
      notices.items.some(
        (item: { type: string; postId: string }) => item.type === 'FOLLOWED_POST' && item.postId === post.id,
      ),
    ).toBe(true);
    await author
      .patch(`/api/posts/${post.id}`)
      .set('Origin', origin)
      .send({ title: '수정한 새 소식' })
      .expect(200);
    expect(
      await db.notification.count({
        where: { userId: 'sample-user-0', type: 'FOLLOWED_POST', postId: post.id },
      }),
    ).toBe(1);
    await follower.put(path).set('Origin', origin).send({ notifyNewPosts: false }).expect(200);
    const muted = (await publish()).body;
    expect(await db.notification.count({ where: { postId: muted.id } })).toBe(0);
    await follower.delete(path).set('Origin', origin).expect(200);
    const unfollowed = (await publish()).body;
    expect(await db.notification.count({ where: { postId: unfollowed.id } })).toBe(0);
    await follower
      .put('/api/users/sample-user-0/follow')
      .set('Origin', origin)
      .send({ notifyNewPosts: true })
      .expect(400);
    await follower.put(path).set('Origin', origin).send({ notifyNewPosts: 'yes' }).expect(400);
  });

  it('removes both follow directions on block and hides blocked posts, views and alerts', async () => {
    const { db } = fixture();
    const one = await account('sample-user-0');
    const other = await account('sample-user-3');
    await one
      .put('/api/users/sample-user-3/follow')
      .set('Origin', origin)
      .send({ notifyNewPosts: true })
      .expect(200);
    await other
      .put('/api/users/sample-user-0/follow')
      .set('Origin', origin)
      .send({ notifyNewPosts: true })
      .expect(200);
    await one.post('/api/blocks').set('Origin', origin).send({ blockedUserId: 'sample-user-3' }).expect(200);
    try {
      expect(await db.userFollow.count()).toBe(0);
      await one
        .put('/api/users/sample-user-3/follow')
        .set('Origin', origin)
        .send({ notifyNewPosts: true })
        .expect(404);
      await one.get('/api/posts/sample-post-3').expect(404);
      await one
        .post('/api/posts/sample-post-3/views')
        .set('Origin', origin)
        .send({ visitorId: randomUUID() })
        .expect(404);
      expect((await one.get('/api/notifications').expect(200)).body.items).toHaveLength(0);
    } finally {
      await one.delete('/api/blocks/sample-user-3').set('Origin', origin).expect(200);
    }
  });

  it('separates the same external subject across all four social providers and preserves repeat logins', async () => {
    const { app } = fixture();
    const ids = new Set<string>();
    for (const provider of SocialProviderSchema.options) {
      const agent = supertest.agent(app.getHttpServer());
      const start = await agent.get(`/api/auth/social/${provider}`).expect(302);
      const oauthState = new URL(start.headers.location).searchParams.get('state');
      await agent
        .get(`/api/auth/social/${provider}/callback`)
        .query({ state: oauthState, code: 'fake-code' })
        .expect(302);
      expect((await agent.get('/api/session')).body.needsOnboarding).toBe(true);
      const user = (
        await agent
          .post('/api/auth/onboard')
          .set('Origin', origin)
          .send({ nickname: `${provider}플레이어`, acceptedTerms: true, ageConfirmed: true })
          .expect(200)
      ).body.user;
      ids.add(user.id);
      const again = await agent.get(`/api/auth/social/${provider}`).expect(302);
      await agent
        .get(`/api/auth/social/${provider}/callback`)
        .query({
          state: new URL(again.headers.location).searchParams.get('state'),
          code: 'another-fake-code',
        })
        .expect(302);
      expect((await agent.get('/api/session')).body.user.id).toBe(user.id);
    }
    expect(ids.size).toBe(4);
  });

  it('binds OAuth state to its provider and preserves the selected provider through a native ticket', async () => {
    const agent = supertest.agent(fixture().app.getHttpServer());
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const start = await agent.get('/api/auth/social/x').query({ app_challenge: challenge }).expect(302);
    const oauthState = new URL(start.headers.location).searchParams.get('state');
    await agent.get('/api/auth/social/kakao/callback').query({ state: oauthState, code: 'fake' }).expect(400);
    const callback = await agent
      .get('/api/auth/social/x/callback')
      .query({ state: oauthState, code: 'fake' })
      .expect(302);
    const code = new URL(callback.headers.location).searchParams.get('code');
    const exchange = await agent
      .post('/api/auth/app/exchange')
      .set('Origin', origin)
      .send({ code, verifier })
      .expect(200);
    expect(exchange.body.user.nickname).toBe('x플레이어');
    await agent.post('/api/auth/app/exchange').set('Origin', origin).send({ code, verifier }).expect(400);
  });
});
