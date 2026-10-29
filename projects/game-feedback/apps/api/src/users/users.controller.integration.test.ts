import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { GameProfile } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { MAX_GAME_ACCOUNTS_PER_USER } from '../game-profiles/game-profiles.service';
import { PrismaClient } from '../generated/prisma';
import {
  ApiError,
  assertDatabaseUrl,
  DemoProfileProvider,
  hash,
  token,
  type IdentityProvider,
  type ProfileProvider,
} from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';

const testDatabaseUrl = process.env.DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);
const requesterId = 'sample-user-0';
const coachId = 'sample-user-3';
const adminId = 'sample-test-admin';
type Agent = ReturnType<typeof supertest.agent>;

describe.skipIf(!testDatabaseUrl)(
  'fixed test accounts and persisted user identity with isolated PostgreSQL',
  () => {
    let app: INestApplication,
      normalApp: INestApplication,
      db: PrismaClient,
      databaseUrl: string,
      schema: string;
    let requester: Agent, coach: Agent, admin: Agent, google: Agent, googleUserId: string, postId: string;
    let failingTag: string | null = null;
    const profiles: ProfileProvider = {
      async lookup(playerTag): Promise<GameProfile> {
        if (playerTag === failingTag) throw new ApiError(503, 'PROFILE_UNAVAILABLE', '테스트 조회 실패');
        const profile = await new DemoProfileProvider().lookup(playerTag);
        return { ...profile, source: 'SUPERCELL', name: `외부 호출 없는 ${playerTag}` };
      },
    };
    const identity: IdentityProvider = {
      authorizationUrl: ({ state }) => `https://accounts.google.com/test?state=${state}`,
      exchange: async () => 'test-accounts-google-subject',
    };
    const choose = (agent: Agent, accountId: string) =>
      agent.post('/api/auth/test-login').set('Origin', origin).send({ accountId });
    async function googleLogin() {
      const start = await google.get('/api/auth/google').expect(302);
      const state = new URL(responseLocation(start)).searchParams.get('state');
      await google.get('/api/auth/google/callback').query({ code: 'fake-code', state }).expect(302);
    }

    beforeAll(async () => {
      const target = new URL(testDatabaseUrl!);
      schema = `gf_test_accounts_${randomBytes(8).toString('hex')}`;
      target.searchParams.set('schema', schema);
      databaseUrl = target.toString();
      assertDatabaseUrl(databaseUrl, 'test');
      const migration = spawnSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        {
          env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
          encoding: 'utf8',
        },
      );
      if (migration.status !== 0)
        throw new Error(`Isolated account schema setup failed: ${migration.stderr}\n${migration.stdout}`);
      db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
      await seed(db, true);
      app = await createApp({
        databaseUrl,
        webOrigin: origin,
        demoMode: true,
        rateLimit: false,
        prisma: db,
        profileProvider: profiles,
      });
      normalApp = await createApp({
        databaseUrl,
        webOrigin: origin,
        demoMode: false,
        rateLimit: false,
        prisma: db,
        identityProvider: identity,
        profileProvider: profiles,
      });
      requester = supertest.agent(app.getHttpServer());
      coach = supertest.agent(app.getHttpServer());
      admin = supertest.agent(app.getHttpServer());
      google = supertest.agent(normalApp.getHttpServer());
    }, 30000);

    afterAll(async () => {
      await normalApp?.close();
      await app?.close();
      if (db) {
        if (!/^gf_test_accounts_[a-f0-9]+$/.test(schema))
          throw new Error('Refusing to delete an unowned schema.');
        await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await db.$disconnect();
      }
    }, 15000);

    it('serves only public profile fields and hides test identities outside demo mode', async () => {
      const profile = (await supertest(app.getHttpServer()).get(`/api/users/${coachId}`).expect(200)).body;
      expect(profile.author).toMatchObject({
        id: coachId,
        nickname: '덱연구소',
        isVerified: true,
        isTestAccount: true,
      });
      expect(Object.keys(profile).sort()).toEqual([
        'answerCount',
        'author',
        'bio',
        'gameAccounts',
        'helpfulCount',
        'joinedAt',
        'links',
        'postCount',
      ]);
      expect(Object.keys(profile.author).sort()).toEqual([
        'avatarUrl',
        'id',
        'isTestAccount',
        'isVerified',
        'nickname',
        'supercellTag',
      ]);
      expect(profile.joinedAt).toBeTypeOf('string');
      expect(profile.bio).toBe('');
      const accounts = await db.gameAccount.findMany({
        where: { userId: coachId },
        orderBy: { updatedAt: 'desc' },
      });
      expect(accounts).toHaveLength(1);
      expect(profile.gameAccounts).toEqual(accounts.map((account) => account.profile));
      expect(profile.gameAccounts[0]).not.toHaveProperty('userId');
      expect(profile.gameAccounts[0]).not.toHaveProperty('id');
      await supertest(normalApp.getHttpServer()).get(`/api/users/${coachId}`).expect(404);
      await supertest(app.getHttpServer()).get('/api/users/missing-user').expect(404);
    });

    it('counts and paginates only visible authored posts and answers under visible parents', async () => {
      const anonymous = supertest(app.getHttpServer());
      const before = (await anonymous.get(`/api/users/${coachId}`)).body;
      const created = await db.post.createManyAndReturn({
        data: [
          {
            authorId: coachId,
            categoryId: 'clash-royale',
            title: '공개 프로필 요청 첫째',
            body: '프로필 조회 검증을 위한 공개 요청 본문입니다.',
          },
          {
            authorId: coachId,
            categoryId: 'clash-royale',
            title: '공개 프로필 요청 둘째',
            body: '프로필 조회 검증을 위한 공개 요청 본문입니다.',
          },
          {
            authorId: coachId,
            categoryId: 'clash-royale',
            title: '숨긴 요청',
            body: '검색에 노출하지 않는 본문입니다.',
            hidden: true,
          },
          {
            authorId: coachId,
            categoryId: 'clash-royale',
            title: '삭제한 요청',
            body: '검색에 노출하지 않는 본문입니다.',
            deletedAt: new Date(),
          },
        ],
        select: { id: true },
      });
      try {
        const [visiblePost, , hiddenPost, deletedPost] = created;
        if (!visiblePost || !hiddenPost || !deletedPost) throw new Error('Expected the four created posts.');
        await db.answer.createMany({
          data: [
            { postId: visiblePost.id, authorId: coachId, body: '공개 답변', helpful: true },
            { postId: visiblePost.id, authorId: coachId, body: '숨긴 답변', hidden: true, helpful: true },
            { postId: hiddenPost.id, authorId: coachId, body: '숨긴 부모의 답변', helpful: true },
            { postId: deletedPost.id, authorId: coachId, body: '삭제한 부모의 답변', helpful: true },
          ],
        });
        const after = (await anonymous.get(`/api/users/${coachId}`)).body;
        expect(after.postCount).toBe(before.postCount + 2);
        expect(after.answerCount).toBe(before.answerCount + 1);
        expect(after.helpfulCount).toBe(before.helpfulCount + 1);
        const first = (await anonymous.get('/api/posts').query({ authorId: coachId, limit: 1 }).expect(200))
          .body;
        const second = (
          await anonymous
            .get('/api/posts')
            .query({ authorId: coachId, limit: 1, cursor: first.nextCursor })
            .expect(200)
        ).body;
        expect(first.items[0].author.id).toBe(coachId);
        expect(second.items[0].author.id).toBe(coachId);
        expect(first.items[0].id).not.toBe(second.items[0].id);
        const all = (await anonymous.get('/api/posts').query({ authorId: coachId, limit: 50 })).body.items;
        expect(
          all.some((post: { id: string }) => post.id === hiddenPost.id || post.id === deletedPost.id),
        ).toBe(false);
        expect(all.every((post: { author: { id: string } }) => post.author.id === coachId)).toBe(true);
      } finally {
        await db.post.deleteMany({ where: { id: { in: created.map((post) => post.id) } } });
      }
    });

    it('applies bidirectional blocking to public profiles and authored post lists', async () => {
      await choose(requester, requesterId).expect(200);
      await choose(coach, coachId).expect(200);
      await coach.post('/api/blocks').set('Origin', origin).send({ blockedUserId: requesterId }).expect(200);
      try {
        await requester.get(`/api/users/${coachId}`).expect(404);
        await coach.get(`/api/users/${requesterId}`).expect(404);
        expect((await requester.get('/api/posts').query({ authorId: coachId })).body.items).toEqual([]);
        await supertest(app.getHttpServer()).get(`/api/users/${coachId}`).expect(200);
      } finally {
        await coach.delete(`/api/blocks/${requesterId}`).set('Origin', origin).expect(200);
        await requester.post('/api/auth/logout').set('Origin', origin).expect(200);
        await coach.post('/api/auth/logout').set('Origin', origin).expect(200);
      }
    });

    it('lists exactly the fixed test identities and labels the verified coach as a test account', async () => {
      const catalog = (await requester.get('/api/auth/test-accounts').expect(200)).body;
      expect(catalog.items.map((user: { id: string }) => user.id).sort()).toEqual(
        [requesterId, coachId, adminId].sort(),
      );
      for (const account of catalog.items) expect(account.isTestAccount).toBe(true);
      expect(catalog.items.find((user: { id: string }) => user.id === requesterId)).toMatchObject({
        nickname: '새벽의호그',
        role: 'USER',
        isVerified: false,
        supercellTag: '#GG829JGY',
      });
      expect(catalog.items.find((user: { id: string }) => user.id === coachId)).toMatchObject({
        nickname: '덱연구소',
        role: 'USER',
        isVerified: true,
        supercellTag: '#9QY82JGY',
      });
      expect(catalog.items.find((user: { id: string }) => user.id === adminId)).toMatchObject({
        role: 'ADMIN',
        isVerified: false,
        supercellTag: null,
      });
    });

    it('rejects arbitrary identities and caller-supplied privilege flags', async () => {
      await choose(requester, 'sample-user-1').expect(404);
      await choose(requester, 'not-an-existing-user').expect(404);
      await requester
        .post('/api/auth/test-login')
        .set('Origin', origin)
        .send({ accountId: requesterId, role: 'ADMIN' })
        .expect(400);
      await requester
        .post('/api/auth/test-login')
        .set('Origin', origin)
        .send({ accountId: requesterId, isVerified: true })
        .expect(400);
      expect((await requester.get('/api/session')).body.user).toBeNull();
    });

    it('issues persisted sessions for fixed accounts and exposes their preseeded activity', async () => {
      expect((await choose(requester, requesterId).expect(200)).body.user).toMatchObject({
        id: requesterId,
        isTestAccount: true,
        isVerified: false,
        supercellTag: '#GG829JGY',
      });
      const coachSession = (await choose(coach, coachId).expect(200)).body;
      expect(coachSession.user).toMatchObject({ id: coachId, isTestAccount: true, isVerified: true });
      expect(coachSession.user.verifiedAt).toBeTypeOf('string');
      await choose(admin, adminId).expect(200);
      expect(await db.session.count({ where: { userId: requesterId } })).toBeGreaterThan(0);
      const detail = (await requester.get('/api/posts/sample-post-0').expect(200)).body;
      expect(detail.post.author.id).toBe(requesterId);
      expect(
        detail.comments.some((comment: { author: { id: string } }) => comment.author.id === coachId),
      ).toBe(true);
      const conversations = (await requester.get('/api/conversations').expect(200)).body.items;
      expect(
        conversations.some(
          (conversation: { peer: { id: string }; lastMessage: unknown }) =>
            conversation.peer.id === coachId && conversation.lastMessage,
        ),
      ).toBe(true);
    });

    it('writes posts, comments, and chat with the selected persisted author', async () => {
      const post = (
        await requester
          .post('/api/posts')
          .set('Origin', origin)
          .send({
            title: '고정 계정으로 작성한 피드백 요청',
            body: '실제 사용자 세션으로 작성한 게시글의 작성자와 저장 결과를 확인합니다.',
            categoryId: 'clash-royale',
          })
          .expect(200)
      ).body;
      postId = post.id;
      expect(post.author.id).toBe(requesterId);
      expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).authorId).toBe(requesterId);
      const comment = (
        await coach
          .post(`/api/posts/${post.id}/comments`)
          .set('Origin', origin)
          .send({ body: '선택한 코치 계정의 댓글입니다.' })
          .expect(200)
      ).body;
      expect(comment.author).toMatchObject({ id: coachId, isVerified: true, isTestAccount: true });
      expect((await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).authorId).toBe(coachId);
      const conversation = (
        await requester
          .post('/api/conversations')
          .set('Origin', origin)
          .send({ recipientId: coachId })
          .expect(200)
      ).body;
      const { randomUUID } = await import('node:crypto');
      const message = (
        await coach
          .post(`/api/conversations/${conversation.id}/messages`)
          .set('Origin', origin)
          .send({ body: '고정 코치의 실제 DB 메시지입니다.', clientMessageId: randomUUID() })
          .expect(200)
      ).body;
      expect(message.sender.id).toBe(coachId);
      expect((await db.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).senderId).toBe(coachId);
    });

    it('rotates sessions on account switch and keeps third-party private chats inaccessible', async () => {
      const switched = supertest.agent(app.getHttpServer());
      const first = await choose(switched, requesterId).expect(200);
      const oldCookie = (first.headers['set-cookie'] as unknown as string[])
        .map((value) => value.split(';')[0])
        .join('; ');
      const conversation = (
        await switched
          .post('/api/conversations')
          .set('Origin', origin)
          .send({ recipientId: coachId })
          .expect(200)
      ).body;
      expect((await choose(switched, adminId).expect(200)).body.user.id).toBe(adminId);
      expect((await switched.get('/api/session')).body.user.id).toBe(adminId);
      expect(
        (await supertest(app.getHttpServer()).get('/api/session').set('Cookie', oldCookie)).body.user,
      ).toBeNull();
      await switched.get(`/api/conversations/${conversation.id}/messages`).expect(404);
      expect(
        (await switched.get('/api/conversations')).body.items.some(
          (item: { id: string }) => item.id === conversation.id,
        ),
      ).toBe(false);
    });

    it('disables fixed account endpoints outside explicit demo mode and rejects production demo startup', async () => {
      await google.get('/api/auth/test-accounts').expect(404);
      await google
        .post('/api/auth/test-login')
        .set('Origin', origin)
        .send({ accountId: adminId })
        .expect(404);
      const previous = process.env.ENVIRONMENT;
      process.env.ENVIRONMENT = 'production';
      try {
        await expect(createApp({ databaseUrl, demoMode: true, prisma: db })).rejects.toThrow(
          /forbidden in production/i,
        );
      } finally {
        process.env.ENVIRONMENT = previous;
      }
    });

    it('starts a normal Google signup without verification, a test flag, or a Supercell tag', async () => {
      await googleLogin();
      await google
        .post('/api/auth/onboard')
        .set('Origin', origin)
        .send({ nickname: '일반가입사용자', acceptedTerms: true, ageConfirmed: true, isVerified: true })
        .expect(400);
      const signup = (
        await google
          .post('/api/auth/onboard')
          .set('Origin', origin)
          .send({ nickname: '일반가입사용자', acceptedTerms: true, ageConfirmed: true })
          .expect(200)
      ).body;
      googleUserId = signup.user.id;
      expect(signup.user).toMatchObject({
        isVerified: false,
        verifiedAt: null,
        isTestAccount: false,
        supercellTag: null,
        role: 'USER',
      });
      const persisted = await db.user.findUniqueOrThrow({ where: { id: googleUserId } });
      expect(persisted).toMatchObject({ isVerified: false, verifiedAt: null, supercellTag: null });
    });

    it('permits verification changes only for an administrator and records revocation consistently', async () => {
      await requester
        .patch(`/api/admin/users/${requesterId}/verification`)
        .set('Origin', origin)
        .send({ isVerified: true })
        .expect(403);
      await google
        .patch(`/api/admin/users/${googleUserId}/verification`)
        .set('Origin', origin)
        .send({ isVerified: true })
        .expect(403);
      await admin
        .patch(`/api/admin/users/${requesterId}/verification`)
        .set('Origin', origin)
        .send({ isVerified: true, role: 'ADMIN' })
        .expect(400);
      const verified = (
        await admin
          .patch(`/api/admin/users/${requesterId}/verification`)
          .set('Origin', origin)
          .send({ isVerified: true })
          .expect(200)
      ).body;
      expect(verified).toMatchObject({
        id: requesterId,
        isVerified: true,
        role: 'USER',
        isTestAccount: true,
      });
      expect(verified.verifiedAt).toBeTypeOf('string');
      expect((await requester.get('/api/session')).body.user.isVerified).toBe(true);
      expect((await requester.get(`/api/posts/${postId}`)).body.post.author.isVerified).toBe(true);
      expect(await db.auditLog.count({ where: { actorId: adminId, targetId: requesterId } })).toBeGreaterThan(
        0,
      );
      const revoked = (
        await admin
          .patch(`/api/admin/users/${requesterId}/verification`)
          .set('Origin', origin)
          .send({ isVerified: false })
          .expect(200)
      ).body;
      expect(revoked).toMatchObject({ isVerified: false, verifiedAt: null, role: 'USER' });
      expect((await db.user.findUniqueOrThrow({ where: { id: requesterId } })).verifiedAt).toBeNull();
    });

    it.each(['#', '#AAAAAAAAAAAAAAAA', '#AB12_CD4', '#AB12 CD4', '#가A12CD34', '##AB12CD34'])(
      'rejects malformed tag %s in lookup and account registration',
      async (playerTag) => {
        await google.get(`/api/game-profiles/${encodeURIComponent(playerTag)}`).expect(400);
        await google.post('/api/me/game-accounts').set('Origin', origin).send({ playerTag }).expect(400);
      },
    );

    it('requires sign-in before a profile lookup can spend the game API token', async () => {
      const anonymous = supertest(app.getHttpServer());
      for (const playerTag of ['#P0LYQ829', '#AB12CD3'])
        expect(
          (await anonymous.get(`/api/game-profiles/${encodeURIComponent(playerTag)}`).expect(401)).body
            .errorCode,
        ).toBe('AUTH_REQUIRED');
      await anonymous.get('/api/me/game-accounts').expect(401);
      const preview = await google.get(`/api/game-profiles/${encodeURIComponent('#P0LYQ829')}`).expect(200);
      expect(preview.body).toMatchObject({ playerTag: '#P0LYQ829' });
    });

    it('looks up and persists a nine-character tag without truncating it', async () => {
      const account = supertest.agent(app.getHttpServer());
      await choose(account, requesterId).expect(200);
      const tag = '#P0LYQ829G';
      const preview = await account.get(`/api/game-profiles/${encodeURIComponent(tag)}`).expect(200);
      expect(preview.body.playerTag).toBe(tag);
      const saved = await account
        .post('/api/me/game-accounts')
        .set('Origin', origin)
        .send({ playerTag: ' p0lyq829g ' })
        .expect(200);
      expect(saved.body.playerTag).toBe(tag);
      expect((await account.get('/api/session')).body.user.supercellTag).toBe(tag);
      expect((await account.get('/api/me/game-accounts')).body).toEqual(
        expect.arrayContaining([expect.objectContaining({ playerTag: tag })]),
      );
    });

    it('keeps only the most recent game accounts instead of one row per looked-up tag', async () => {
      // 다른 사례가 쓰는 고정 계정의 대표 태그를 바꾸지 않도록 전용 사용자를 만든다.
      const user = await db.user.create({
        data: { nickname: '계정상한확인', termsVersion: '2026-10', ageConfirmed: true },
      });
      const raw = token();
      await db.session.create({
        data: { tokenHash: hash(raw), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const save = (playerTag: string) =>
        supertest(app.getHttpServer())
          .post('/api/me/game-accounts')
          .set('Origin', origin)
          .set('Authorization', `Bearer ${raw}`)
          .send({ playerTag })
          .expect(200);
      const tags = Array.from({ length: MAX_GAME_ACCOUNTS_PER_USER + 2 }, (_, index) => `#CAP${index}`);
      for (const playerTag of tags) await save(playerTag);
      // 예전 태그를 다시 저장하면 가장 최근 계정으로 남는다.
      await save('#CAP0');
      const saved = (
        await supertest(app.getHttpServer())
          .get('/api/me/game-accounts')
          .set('Authorization', `Bearer ${raw}`)
          .expect(200)
      ).body as Array<{ playerTag: string }>;
      expect(saved.map(({ playerTag }) => playerTag)).toEqual(['#CAP0', ...tags.slice(-4).reverse()]);
      expect(await db.gameAccount.count({ where: { userId: user.id } })).toBe(MAX_GAME_ACCOUNTS_PER_USER);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).supercellTag).toBe('#CAP0');
    });

    it('registers the user tag on the account while posts use the current author identity', async () => {
      const linked = (
        await google
          .post('/api/me/game-accounts')
          .set('Origin', origin)
          .send({ playerTag: ' ab12cd34 ' })
          .expect(200)
      ).body;
      expect(linked).toMatchObject({ playerTag: '#AB12CD34', verification: 'UNVERIFIED' });
      expect((await google.get('/api/session')).body.user.supercellTag).toBe('#AB12CD34');
      expect((await db.user.findUniqueOrThrow({ where: { id: googleUserId } })).supercellTag).toBe(
        '#AB12CD34',
      );
      expect(
        await db.gameAccount.findUnique({
          where: { userId_playerTag: { userId: googleUserId, playerTag: '#AB12CD34' } },
        }),
      ).not.toBeNull();
      const post = (
        await google
          .post('/api/posts')
          .set('Origin', origin)
          .send({
            title: '게임 프로필 스냅샷 보존 확인',
            body: '프로필을 변경한 뒤에도 작성 당시 게임 프로필과 덱 정보를 유지하는지 확인합니다.',
            categoryId: 'clash-royale',
          })
          .expect(200)
      ).body;
      expect(post.gameProfile).toBeNull();
      await google
        .post('/api/me/game-accounts')
        .set('Origin', origin)
        .send({ playerTag: '9qy82jgy' })
        .expect(200);
      expect((await google.get('/api/session')).body.user.supercellTag).toBe('#9QY82JGY');
      expect((await google.get(`/api/posts/${post.id}`)).body.post.author.supercellTag).toBe('#9QY82JGY');
      expect((await db.user.findUniqueOrThrow({ where: { id: googleUserId } })).isVerified).toBe(false);
      const accounts = (await google.get('/api/me/game-accounts')).body;
      expect(accounts.map((account: { playerTag: string }) => account.playerTag)).toEqual(
        expect.arrayContaining(['#AB12CD34', '#9QY82JGY']),
      );
    });

    it('preserves the last successful tag on failed lookup and across Google relogin', async () => {
      failingTag = '#PYL829JG';
      await google
        .post('/api/me/game-accounts')
        .set('Origin', origin)
        .send({ playerTag: 'pyl829jg' })
        .expect(503);
      await google
        .post('/api/me/game-accounts')
        .set('Origin', origin)
        .send({ playerTag: 'not-a-tag!' })
        .expect(400);
      expect((await db.user.findUniqueOrThrow({ where: { id: googleUserId } })).supercellTag).toBe(
        '#9QY82JGY',
      );
      expect(
        await db.gameAccount.findUnique({
          where: { userId_playerTag: { userId: googleUserId, playerTag: '#PYL829JG' } },
        }),
      ).toBeNull();
      await google.post('/api/auth/logout').set('Origin', origin).expect(200);
      await googleLogin();
      expect((await google.get('/api/session')).body.user).toMatchObject({
        id: googleUserId,
        nickname: '일반가입사용자',
        supercellTag: '#9QY82JGY',
        isVerified: false,
        verifiedAt: null,
        isTestAccount: false,
      });
    });
  },
);
