import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app';
import { hash } from '../common/crypto';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';
import { SessionService } from './session.service';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_withdrawal_${randomBytes(8).toString('hex')}`;
type TAgent = ReturnType<typeof supertest.agent>;

describe('계정 탈퇴와 소셜 계정 제재 보존', () => {
  let db: PrismaClient;
  let app: INestApplication;
  let adminToken: string;

  const login = async (agent: TAgent, provider: TSocialProvider, subject: string) => {
    const start = await agent.get(`/api/auth/social/${provider}`).expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    await agent.get(`/api/auth/social/${provider}/callback`).query({ state, code: subject }).expect(302);
  };
  const onboard = (agent: TAgent, nickname = '재가입 사용자') =>
    agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ nickname, acceptedTerms: true, ageConfirmed: true })
      .expect(200);
  const account = async (provider: TSocialProvider = 'google') => {
    const subject = randomBytes(16).toString('hex');
    const agent = supertest.agent(app.getHttpServer());
    await login(agent, provider, subject);
    const response = await onboard(agent, '탈퇴 전 사용자');
    return { agent, subject, id: response.body.user.id as string };
  };
  const ban = (id: string, banned: boolean) =>
    supertest(app.getHttpServer())
      .patch(`/api/admin/users/${id}/ban`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ banned, reason: banned ? '반복적인 서비스 악용' : '관리자 확인 후 제재 해제' })
      .expect(200);
  const withdraw = (agent: TAgent) => agent.delete('/api/me').set('Origin', origin).expect(200);
  const postInput = { categoryId: 'clash-royale', board: 'FREE', title: '남길 글', body: '본문' };

  beforeAll(async () => {
    const target = new URL(process.env.TEST_DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0)
      throw new Error(`Withdrawal migration failed: ${migration.stdout}\n${migration.stderr}`);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, false);
    app = await createApp({
      databaseUrl,
      prisma: db,
      webOrigin: origin,
      demoMode: false,
      rateLimit: false,
      identityProviders: Object.fromEntries(
        SocialProviderSchema.options.map((provider) => [
          provider,
          {
            authorizationUrl: ({ state }: { state: string }) =>
              `https://${provider}.example.test/?state=${state}`,
            exchange: async (code: string) => code,
          },
        ]),
      ),
    });
    const admin = await db.user.create({
      data: { nickname: '탈퇴검증 관리자', role: 'ADMIN', termsVersion: 'test', ageConfirmed: true },
    });
    adminToken = randomBytes(32).toString('base64url');
    await db.session.create({
      data: { tokenHash: hash(adminToken), userId: admin.id, expiresAt: new Date(Date.now() + 60000) },
    });
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_withdrawal_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned withdrawal schema');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('일반 탈퇴는 개인정보와 본인 콘텐츠를 지우고 다른 사람의 답변·댓글을 보존해야 한다', async () => {
    const user = await account();
    const peer = await account('kakao');
    const ownPost = await db.post.create({ data: { ...postInput, authorId: user.id } });
    const peerPost = await db.post.create({ data: { ...postInput, authorId: peer.id } });
    const peerAnswer = await db.answer.create({
      data: { postId: ownPost.id, authorId: peer.id, body: '다른 사람의 답변' },
    });
    const peerComment = await db.comment.create({
      data: { postId: ownPost.id, authorId: peer.id, body: '다른 사람의 댓글' },
    });
    const ownAnswer = await db.answer.create({
      data: { postId: peerPost.id, authorId: user.id, body: '지울 답변' },
    });
    const ownComment = await db.comment.create({
      data: { postId: peerPost.id, authorId: user.id, body: '지울 댓글' },
    });
    await db.user.update({
      where: { id: user.id },
      data: { profileLinks: [{ url: 'https://example.test/private' }], supercellTag: '#PERSONAL' },
    });
    await peer.agent
      .put(`/api/users/${user.id}/follow`)
      .set('Origin', origin)
      .send({ notifyNewPosts: true })
      .expect(200);
    await withdraw(user.agent);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      withdrawnAt: expect.any(Date),
      nickname: '탈퇴한 사용자',
      googleSubject: null,
      profileLinks: [],
      supercellTag: null,
      isVerified: false,
    });
    expect(await db.post.findUniqueOrThrow({ where: { id: ownPost.id } })).toMatchObject({
      deletedAt: expect.any(Date),
      title: '삭제된 요청',
      body: '',
    });
    expect(await db.answer.findUniqueOrThrow({ where: { id: peerAnswer.id } })).toMatchObject({
      body: '다른 사람의 답변',
      deletedAt: null,
      authorId: peer.id,
    });
    expect(await db.comment.findUniqueOrThrow({ where: { id: peerComment.id } })).toMatchObject({
      body: '다른 사람의 댓글',
      deletedAt: null,
      authorId: peer.id,
    });
    expect(await db.answer.findUniqueOrThrow({ where: { id: ownAnswer.id } })).toMatchObject({
      deletedAt: expect.any(Date),
      body: '',
    });
    expect(await db.comment.findUniqueOrThrow({ where: { id: ownComment.id } })).toMatchObject({
      deletedAt: expect.any(Date),
      body: '',
    });
    expect(await db.socialIdentity.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(0);
    expect((await user.agent.get('/api/session').expect(200)).body.user).toBeNull();
    await peer.agent.get(`/api/users/${user.id}`).expect(404);
    await peer.agent.get(`/api/posts/${ownPost.id}`).expect(404);
    await peer.agent
      .post('/api/conversations')
      .set('Origin', origin)
      .send({ recipientId: user.id })
      .expect(404);
    await peer.agent
      .put(`/api/users/${user.id}/follow`)
      .set('Origin', origin)
      .send({ notifyNewPosts: true })
      .expect(404);
    await peer.agent.post('/api/blocks').set('Origin', origin).send({ blockedUserId: user.id }).expect(404);
    await login(user.agent, 'google', user.subject);
    const rejoined = await onboard(user.agent);
    expect(rejoined.body.user.id).not.toBe(user.id);
    expect(rejoined.body.user.bannedAt).toBeNull();
  });

  it('밴된 Google 사용자는 반복 탈퇴·재가입 후에도 제한되고 관리자 해제는 새 세션에 적용되어야 한다', async () => {
    const user = await account();
    await ban(user.id, true);
    for (let attempt = 0; attempt < 2; attempt++) {
      await withdraw(user.agent);
      const restrictions = await db.retainedIdentityRestriction.findMany({ where: { userId: user.id } });
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]?.identityHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(restrictions)).not.toContain(user.subject);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).googleSubject).toBeNull();
      await login(user.agent, 'google', user.subject);
      const rejoined = await onboard(user.agent);
      expect(rejoined.body.user).toMatchObject({ id: user.id, bannedAt: expect.any(String) });
      await user.agent.post('/api/posts').set('Origin', origin).send(postInput).expect(403);
      await user.agent
        .post('/api/support/conversations')
        .set('Origin', origin)
        .send({ topic: 'GENERAL' })
        .expect(200);
    }
    await ban(user.id, false);
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(0);
    expect((await user.agent.get('/api/session').expect(200)).body.user.bannedAt).toBeNull();
    await user.agent.post('/api/posts').set('Origin', origin).send(postInput).expect(200);
  });

  it('여러 provider로 연결된 제재는 같은 계정과 관리자 해제 상태를 공유해야 한다', async () => {
    const user = await account('discord');
    const googleSubject = randomBytes(16).toString('hex');
    await db.socialIdentity.create({ data: { provider: 'google', subject: googleSubject, userId: user.id } });
    await db.user.update({ where: { id: user.id }, data: { googleSubject } });
    await ban(user.id, true);
    await withdraw(user.agent);
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(2);
    await login(user.agent, 'google', googleSubject);
    expect((await onboard(user.agent)).body.user).toMatchObject({
      id: user.id,
      bannedAt: expect.any(String),
    });
    const discord = supertest.agent(app.getHttpServer());
    await login(discord, 'discord', user.subject);
    expect((await onboard(discord)).body.user.id).toBe(user.id);
    await ban(user.id, false);
    expect((await discord.get('/api/session').expect(200)).body.user.bannedAt).toBeNull();
    expect((await user.agent.get('/api/session').expect(200)).body.user.bannedAt).toBeNull();
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('탈퇴 중인 계정도 기존 사용자 id로 제재를 해제할 수 있어야 한다', async () => {
    const user = await account('kakao');
    await ban(user.id, true);
    await withdraw(user.agent);
    await ban(user.id, false);
    await login(user.agent, 'kakao', user.subject);
    const rejoined = await onboard(user.agent);
    expect(rejoined.body.user.id).not.toBe(user.id);
    expect(rejoined.body.user.bannedAt).toBeNull();
  });

  it('탈퇴가 먼저 확정되면 관리자 제재를 성공으로 응답하지 않아야 한다', async () => {
    const user = await account();
    await withdraw(user.agent);
    await supertest(app.getHttpServer())
      .patch(`/api/admin/users/${user.id}/ban`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ banned: true, reason: '탈퇴와 동시에 요청한 제재' })
      .expect(409);
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('레거시 Google 계정도 소셜 identity 행 없이 제재를 유지해야 한다', async () => {
    const user = await account();
    await db.socialIdentity.deleteMany({ where: { userId: user.id } });
    await ban(user.id, true);
    await withdraw(user.agent);
    await login(user.agent, 'google', user.subject);
    expect((await onboard(user.agent)).body.user).toMatchObject({
      id: user.id,
      bannedAt: expect.any(String),
    });
  });

  it('탈퇴 요청이 세션을 읽은 뒤 관리자가 밴을 확정해도 최신 제재를 보존해야 한다', async () => {
    const user = await account();
    const gate = Promise.withResolvers<void>();
    const locked = Promise.withResolvers<void>();
    const loaded = Promise.withResolvers<void>();
    const moderator = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.user.update({
        where: { id: user.id },
        data: { bannedAt: new Date(), banReason: '동시 제재' },
      });
      locked.resolve();
      await gate.promise;
    });
    await locked.promise;
    const sessions = app.get(SessionService);
    const loadSession = sessions.loadSession.bind(sessions);
    const spy = vi.spyOn(sessions, 'loadSession').mockImplementation(async (req) => {
      await loadSession(req);
      if (req.method === 'DELETE' && req.path === '/api/me' && req.gfSession?.user?.id === user.id) {
        expect(req.gfSession.user.bannedAt).toBeNull();
        loaded.resolve();
      }
    });
    try {
      const deletion = withdraw(user.agent).then((response) => response);
      await loaded.promise;
      gate.resolve();
      await moderator;
      await deletion;
    } finally {
      gate.resolve();
      await moderator;
      spy.mockRestore();
    }
    expect(await db.retainedIdentityRestriction.count({ where: { userId: user.id } })).toBe(1);
    await login(user.agent, 'google', user.subject);
    expect((await onboard(user.agent)).body.user).toMatchObject({
      id: user.id,
      bannedAt: expect.any(String),
    });
  });
});
