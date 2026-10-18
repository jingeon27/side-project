import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import { createApp } from './app';
import { seed } from './seed';
import { assertDatabaseUrl, DemoProfileProvider, type IdentityProvider } from './security';

const baseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);
describe.skipIf(!baseUrl)('persistent API core with isolated PostgreSQL', () => {
  let app: INestApplication, db: PrismaClient, url: string, schema: string;
  let requester: ReturnType<typeof supertest.agent>,
    coach: ReturnType<typeof supertest.agent>,
    stranger: ReturnType<typeof supertest.agent>;
  let post: any, answer: any, coachUser: any;
  const login = async (agent: ReturnType<typeof supertest.agent>, nickname: string) =>
    agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
  beforeAll(async () => {
    const parsed = new URL(baseUrl!);
    schema = `gf_test_api_${randomBytes(8).toString('hex')}`;
    parsed.searchParams.set('schema', schema);
    url = parsed.toString();
    assertDatabaseUrl(url, 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url }, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(`Isolated test migration failed: ${result.stderr}\n${result.stdout}`);
    db = new PrismaClient({ datasources: { db: { url } } });
    await seed(db, false);
    app = await createApp({
      databaseUrl: url,
      webOrigin: origin,
      demoMode: true,
      rateLimit: false,
      prisma: db,
      profileProvider: new DemoProfileProvider(),
    });
    requester = supertest.agent(app.getHttpServer());
    coach = supertest.agent(app.getHttpServer());
    stranger = supertest.agent(app.getHttpServer());
    await login(requester, '요청자');
    coachUser = (await login(coach, '피드백코치')).body.user;
    await login(stranger, '지나가는유저');
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  }, 15000);
  it('rejects CSRF and anonymous mutations', async () => {
    await supertest(app.getHttpServer()).post('/api/auth/demo').send({ nickname: '악성로그인' }).expect(403);
    const response = await supertest(app.getHttpServer())
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        title: '권한 확인',
        body: '인증하지 않은 사용자 요청은 작성할 수 없습니다.',
        categoryId: 'clash-royale',
      })
      .expect(401);
    expect(response.body.errorCode).toBe('AUTH_REQUIRED');
  });
  it('keeps game accounts on the user instead of attaching a profile to a post', async () => {
    const response = await requester
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        title: '호그 운영 피드백 부탁드려요',
        body: '메가나이트를 상대할 때 수비 이후 공격 타이밍이 고민됩니다. 덱 운영을 알려주세요.',
        categoryId: 'clash-royale',
      })
      .expect(200);
    post = response.body;
    expect(post.gameProfile).toBeNull();
    expect(await db.post.count({ where: { id: post.id } })).toBe(1);
    const detail = await requester.get(`/api/posts/${post.id}`).expect(200);
    expect(detail.body.post.gameProfile).toEqual(post.gameProfile);
  });
  it('protects ownership and admin controls', async () => {
    await stranger
      .patch(`/api/posts/${post.id}`)
      .set('Origin', origin)
      .send({ title: '다른 유저 수정' })
      .expect(403);
    await stranger.delete(`/api/posts/${post.id}`).set('Origin', origin).expect(403);
    await stranger
      .post('/api/admin/categories')
      .set('Origin', origin)
      .send({ slug: 'new-game', name: '게임' })
      .expect(403);
  });
  it('creates answers and requester notifications atomically', async () => {
    answer = (
      await coach
        .post(`/api/posts/${post.id}/answers`)
        .set('Origin', origin)
        .send({ body: '얼음 골렘을 중앙으로 이동시키고 대포와 머스킷병 사이의 거리를 벌려 보세요.' })
        .expect(200)
    ).body;
    const notifications = (await requester.get('/api/notifications').expect(200)).body;
    expect(notifications.unreadCount).toBe(1);
    expect(notifications.items[0].answerId).toBe(answer.id);
    expect(
      (await requester.get('/api/posts?unanswered=true')).body.items.some((p: any) => p.id === post.id),
    ).toBe(false);
  });
  it('enforces helpful requester-only and avoids duplicate notifications', async () => {
    await coach
      .post(`/api/answers/${answer.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(403);
    await stranger
      .post(`/api/answers/${answer.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(403);
    await requester
      .post(`/api/answers/${answer.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(200);
    await requester
      .post(`/api/answers/${answer.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(200);
    expect(await db.notification.count({ where: { userId: coachUser.id, type: 'HELPFUL' } })).toBe(1);
    await requester.post(`/api/posts/${post.id}/read`).set('Origin', origin).send({}).expect(200);
    expect((await requester.get('/api/notifications')).body.unreadCount).toBe(0);
    const detail = (await requester.get(`/api/posts/${post.id}`)).body;
    expect(detail.post.helpfulCount).toBe(1);
    expect(detail.answers[0].readAt).not.toBeNull();
  });
  it('protects comments and supports cursor pagination', async () => {
    const c = (
      await coach
        .post(`/api/posts/${post.id}/comments`)
        .set('Origin', origin)
        .send({ body: '리플레이를 같이 보면 더 좋겠어요.' })
        .expect(200)
    ).body;
    await stranger.patch(`/api/comments/${c.id}`).set('Origin', origin).send({ body: '탈취' }).expect(403);
    await coach
      .patch(`/api/comments/${c.id}`)
      .set('Origin', origin)
      .send({ body: '덱 스크린샷도 함께 올려주세요.' })
      .expect(200);
    await requester
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        title: '두 번째 질문입니다',
        body: '광부 독 운영에서 수비를 마친 다음 공격하는 시점을 구체적으로 알고 싶습니다.',
        categoryId: 'clash-royale',
      })
      .expect(200);
    const first = (await requester.get('/api/posts?limit=1')).body;
    expect(first.nextCursor).not.toBeNull();
    const second = (await requester.get(`/api/posts?limit=1&cursor=${first.nextCursor}`)).body;
    expect(second.items[0].id).not.toBe(first.items[0].id);
    await coach.delete(`/api/comments/${c.id}`).set('Origin', origin).expect(200);
  });
  it('rejects self helpful even on own answers', async () => {
    const own = (
      await requester
        .post(`/api/posts/${post.id}/answers`)
        .set('Origin', origin)
        .send({ body: '추가로 제가 시도한 수비 운영을 여기에 정리해 둡니다.' })
        .expect(200)
    ).body;
    await requester
      .post(`/api/answers/${own.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(403);
  });
  it('reports idempotently and blocks content and interactions both ways', async () => {
    for (let i = 0; i < 2; i++)
      await requester
        .post('/api/reports')
        .set('Origin', origin)
        .send({ targetType: 'ANSWER', targetId: answer.id, reason: 'OTHER', detail: '테스트 신고' })
        .expect(200);
    expect(await db.report.count({ where: { targetId: answer.id } })).toBe(1);
    await requester
      .post('/api/blocks')
      .set('Origin', origin)
      .send({ blockedUserId: coachUser.id })
      .expect(200);
    expect(
      (await requester.get(`/api/posts/${post.id}`)).body.answers.some((a: any) => a.id === answer.id),
    ).toBe(false);
    await coach.get(`/api/posts/${post.id}`).expect(404);
    await coach
      .post(`/api/posts/${post.id}/answers`)
      .set('Origin', origin)
      .send({ body: '차단된 사용자에게 답변을 작성할 수 없어야 합니다.' })
      .expect(404);
    expect((await coach.get('/api/notifications')).body.items).toHaveLength(0);
    await requester.delete(`/api/blocks/${coachUser.id}`).set('Origin', origin).expect(200);
  });
  it('hides content with audited admin action', async () => {
    const adminUser = (await login(stranger, '관리자테스트')).body.user;
    await db.user.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });
    await stranger
      .post('/api/admin/hide')
      .set('Origin', origin)
      .send({ targetType: 'ANSWER', targetId: answer.id, hidden: true, reason: '운영자 확인' })
      .expect(200);
    expect(
      (await requester.get(`/api/posts/${post.id}`)).body.answers.some((a: any) => a.id === answer.id),
    ).toBe(false);
    expect(await db.auditLog.count({ where: { targetId: answer.id } })).toBe(1);
  });
  it('deletes accounts, sessions, profile links and authored content', async () => {
    await coach.post('/api/me/game-accounts').set('Origin', origin).send({ playerTag: '#2PP' }).expect(200);
    await coach.delete('/api/me').set('Origin', origin).expect(200);
    expect(await db.user.findUnique({ where: { id: coachUser.id } })).toBeNull();
    expect((await coach.get('/api/session')).body.user).toBeNull();
    expect(await db.gameAccount.count({ where: { userId: coachUser.id } })).toBe(0);
  });
  it('requires onboarding consent and retains Google nickname on relogin', async () => {
    const fake: IdentityProvider = {
      authorizationUrl: ({ state }) => `https://accounts.google.com/test?state=${state}`,
      exchange: async () => 'google-sub-only',
    };
    const authApp = await createApp({
      databaseUrl: url,
      webOrigin: origin,
      demoMode: false,
      rateLimit: false,
      prisma: db,
      identityProvider: fake,
    });
    const agent = supertest.agent(authApp.getHttpServer());
    expect((await agent.get('/api/posts').expect(200)).body.items).toHaveLength(0);
    await agent.get(`/api/posts/${post.id}`).expect(404);
    const start = await agent.get('/api/auth/google').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    await agent.get(`/api/auth/google/callback?code=fake&state=${state}`).expect(302);
    expect((await agent.get('/api/session')).body.needsOnboarding).toBe(true);
    await agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname: '직접지은이름', acceptedTerms: true, ageConfirmed: false })
      .expect(400);
    await agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname: '직접지은이름', acceptedTerms: true, ageConfirmed: true })
      .expect(200);
    expect((await agent.get('/api/session')).body.user.nickname).toBe('직접지은이름');
    await agent.post('/api/auth/logout').set('Origin', origin).expect(200);
    const second = await agent.get('/api/auth/google');
    const secondState = new URL(second.headers.location).searchParams.get('state');
    await agent.get(`/api/auth/google/callback?code=fake&state=${secondState}`).expect(302);
    expect((await agent.get('/api/session')).body.user.nickname).toBe('직접지은이름');
    await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname: '공개위험' }).expect(404);
    await authApp.close();
  });
});
