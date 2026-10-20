import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { createApp } from '../app';
import { seed } from '../seed';
import { assertDatabaseUrl } from '../security';

const target = process.env.TEST_DATABASE_URL;
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
describe.skipIf(!target)('admin support, user reports and bans with isolated PostgreSQL', () => {
  let app: INestApplication,
    db: PrismaClient,
    schema: string,
    author: ReturnType<typeof supertest.agent>,
    categoryId: string;
  beforeAll(async () => {
    const url = new URL(target ?? '');
    schema = `gf_test_support_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = url.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0) throw new Error('Isolated support schema setup failed');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, false);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
    author = supertest.agent(app.getHttpServer());
    await author.post('/api/auth/demo').set('Origin', origin).send({ nickname: '게시판작성자' }).expect(200);
    categoryId = (await author.get('/api/categories').expect(200)).body[0].id;
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db) {
      if (!/^gf_test_support_[a-f0-9]+$/.test(schema)) throw new Error('Unowned schema');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });

  it('routes verification requests into a private admin chat, deduplicates starts and audits verification', async () => {
    const admin = supertest.agent(app.getHttpServer());
    const stranger = supertest.agent(app.getHttpServer());
    await admin
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-test-admin' })
      .expect(200);
    await stranger
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-3' })
      .expect(200);
    const me = (await author.get('/api/session')).body.user;
    await author
      .post('/api/me/game-accounts')
      .set('Origin', origin)
      .send({ playerTag: '#GG829JGY' })
      .expect(200);
    await author.get('/api/admin/support').expect(403);
    await author.get(`/api/admin/users/${me.id}`).expect(403);
    await author
      .patch(`/api/admin/users/${me.id}/verification`)
      .set('Origin', origin)
      .send({ isVerified: true })
      .expect(403);
    const conversation = (
      await author
        .post('/api/support/conversations')
        .set('Origin', origin)
        .send({ topic: 'VERIFICATION' })
        .expect(200)
    ).body;
    expect(conversation.supportTopic).toBe('VERIFICATION');
    expect(conversation.peer.id).toBe('sample-test-admin');
    const repeated = (
      await author
        .post('/api/support/conversations')
        .set('Origin', origin)
        .send({ topic: 'VERIFICATION' })
        .expect(200)
    ).body;
    expect(repeated.id).toBe(conversation.id);
    const { randomUUID } = await import('node:crypto');
    const message = '등록한 게임 계정의 프로필 인증을 요청합니다.';
    await author
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Origin', origin)
      .send({ body: message, clientMessageId: randomUUID() })
      .expect(200);
    const messages = (await admin.get(`/api/conversations/${conversation.id}/messages`).expect(200)).body
      .items;
    expect(messages.map((row: { body: string }) => row.body)).toContain(message);
    await stranger.get(`/api/conversations/${conversation.id}/messages`).expect(404);
    const threads = (await admin.get('/api/admin/support').expect(200)).body;
    const thread = threads.find((row: { requester: { id: string } }) => row.requester.id === me.id);
    expect(thread).toMatchObject({
      topic: 'VERIFICATION',
      conversationId: conversation.id,
      requester: { supercellTag: '#GG829JGY' },
      status: 'OPEN',
    });
    await admin
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Origin', origin)
      .send({ body: '확인 후 인증을 승인했습니다.', clientMessageId: randomUUID() })
      .expect(200);
    await admin
      .patch(`/api/admin/users/${me.id}/verification`)
      .set('Origin', origin)
      .send({ isVerified: true })
      .expect(200);
    expect((await author.get('/api/session')).body.user.isVerified).toBe(true);
    await admin
      .patch(`/api/admin/support/${thread.id}`)
      .set('Origin', origin)
      .send({ status: 'CLOSED' })
      .expect(200);
    expect(await db.auditLog.count({ where: { targetId: me.id, action: 'VERIFY_USER' } })).toBe(1);
    expect((await author.get(`/api/conversations/${conversation.id}/messages`)).body.items).toHaveLength(2);
    await author
      .post('/api/me/game-accounts')
      .set('Origin', origin)
      .send({ playerTag: '#GG829JGY' })
      .expect(200);
    expect((await author.get('/api/session')).body.user.isVerified).toBe(true);
    await author
      .post('/api/me/game-accounts')
      .set('Origin', origin)
      .send({ playerTag: '#9QY82JGY' })
      .expect(200);
    expect((await author.get('/api/session')).body.user.isVerified).toBe(false);
    await author
      .post('/api/support/conversations')
      .set('Origin', origin)
      .send({ topic: 'GENERAL' })
      .expect(200);
    expect((await db.supportConversation.findUniqueOrThrow({ where: { id: thread.id } })).status).toBe(
      'OPEN',
    );
  });
  it('reviews user reports and enforces ban and release on existing sessions while keeping support available', async () => {
    const admin = supertest.agent(app.getHttpServer());
    const peer = supertest.agent(app.getHttpServer());
    await admin
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-test-admin' })
      .expect(200);
    await peer
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-3' })
      .expect(200);
    const id = (await author.get('/api/session')).body.user.id;
    const report = {
      targetType: 'USER',
      targetId: id,
      reason: 'FRAUD',
      detail: '입금 후 약속한 코칭을 제공하지 않고 연락 두절',
    };
    await peer.post('/api/reports').set('Origin', origin).send(report).expect(200);
    await peer.post('/api/reports').set('Origin', origin).send(report).expect(200);
    expect(await db.report.count({ where: { targetId: id, targetType: 'USER' } })).toBe(1);
    await author.post('/api/reports').set('Origin', origin).send(report).expect(400);
    const reports = (await admin.get('/api/admin/reports').expect(200)).body;
    const received = reports.find((row: { targetId: string }) => row.targetId === id);
    expect(received).toMatchObject({ targetUserId: id, reason: report.reason, detail: report.detail });
    await peer
      .patch(`/api/admin/reports/${received.id}`)
      .set('Origin', origin)
      .send({ status: 'REVIEWED' })
      .expect(403);
    await admin
      .patch(`/api/admin/reports/${received.id}`)
      .set('Origin', origin)
      .send({ status: 'REVIEWED' })
      .expect(200);
    await admin
      .patch('/api/admin/users/sample-test-admin/ban')
      .set('Origin', origin)
      .send({ banned: true, reason: '관리자 보호 확인' })
      .expect(400);
    await peer
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .send({ banned: true, reason: '권한 없음' })
      .expect(403);
    await admin
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .send({ banned: true, reason: '' })
      .expect(400);
    const privateRoom = (
      await author
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: 'sample-user-3' })
        .expect(200)
    ).body;
    const ban = await admin
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .send({ banned: true, reason: '신고 확인 후 이용 제한' })
      .expect(200);
    expect(ban.body.bannedAt).toBeTruthy();
    expect((await author.get('/api/session')).body.user.banReason).toBe('신고 확인 후 이용 제한');
    const input = {
      categoryId,
      board: 'FREE',
      title: '밴된 계정 작성 확인',
      body: '제재된 기존 세션의 글쓰기를 서버에서 거부하는지 확인합니다.',
    };
    await author.post('/api/posts').set('Origin', origin).send(input).expect(403);
    await author.post('/api/post-media').set('Origin', origin).expect(403);
    const { randomUUID } = await import('node:crypto');
    await author
      .post(`/api/conversations/${privateRoom.id}/messages`)
      .set('Origin', origin)
      .send({ body: '제재 중 일반 채팅', clientMessageId: randomUUID() })
      .expect(403);
    const support = (
      await author
        .post('/api/support/conversations')
        .set('Origin', origin)
        .send({ topic: 'GENERAL' })
        .expect(200)
    ).body;
    await author
      .post(`/api/conversations/${support.id}/messages`)
      .set('Origin', origin)
      .send({ body: '이용 제한에 대해 문의합니다.', clientMessageId: randomUUID() })
      .expect(200);
    await admin
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .send({ banned: false, reason: '문의 확인 후 제한 해제' })
      .expect(200);
    await author.post('/api/posts').set('Origin', origin).send(input).expect(200);
    expect(
      await db.auditLog.count({ where: { targetId: id, action: { in: ['BAN_USER', 'UNBAN_USER'] } } }),
    ).toBe(2);
    expect((await db.report.findUniqueOrThrow({ where: { id: received.id } })).status).toBe('REVIEWED');
  });
});
