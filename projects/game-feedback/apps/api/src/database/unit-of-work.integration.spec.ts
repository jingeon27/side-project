import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import type { SessionRequest } from '../auth/session.types';
import { historyWhere } from '../chat/chat-history';
import { hash, token } from '../common/crypto';
import { PrismaClient } from '../generated/prisma';
import { UserVisibilityService } from '../users/user-visibility.service';
import { assertDatabaseUrl } from './database-url';
import { createPrismaAdapter } from './prisma-adapter';
import { UnitOfWork } from './unit-of-work';

const require = createRequire(import.meta.url);
const schema = `gf_test_transactions_${randomBytes(8).toString('hex')}`;
const origin = 'http://localhost:3300';
const state = {} as {
  app: INestApplication;
  db: PrismaClient;
  work: UnitOfWork;
  auth: PrismaClient;
  posts: PrismaClient;
  categoryId: string;
  authorId: string;
  readerId: string;
  adminId: string;
  accessToken: string;
  adminToken: string;
};
const userData = (id: string = randomUUID()) => ({
  id,
  nickname: `repo-${id}`,
  termsVersion: 'test-v1',
  ageConfirmed: true,
});
const postData = (authorId: string, id: string = randomUUID()) => ({
  id,
  authorId,
  categoryId: state.categoryId,
  title: `DB ${id}`,
  body: 'DB 통합 검증',
  board: 'FEEDBACK',
});

describe('Game Feedback DB와 업무 트랜잭션', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0) throw new Error(`DB 테스트 migration 실패: ${migration.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '2');
    state.app = await createApp({
      databaseUrl: url.toString(),
      webOrigin: origin,
      demoMode: false,
      rateLimit: false,
    });
    state.work = state.app.get(UnitOfWork);
    state.auth = state.app.get(PrismaClient);
    state.posts = state.app.get(PrismaClient);
    state.categoryId = (
      await state.db.category.create({ data: { slug: 'repository-game', name: 'DB 게임' } })
    ).id;
    state.authorId = (await state.db.user.create({ data: userData() })).id;
    state.readerId = (await state.db.user.create({ data: userData() })).id;
    state.adminId = (await state.db.user.create({ data: { ...userData(), role: 'ADMIN' } })).id;
    state.accessToken = token();
    state.adminToken = token();
    await state.db.session.createMany({
      data: [
        {
          tokenHash: hash(state.accessToken),
          userId: state.authorId,
          expiresAt: new Date(Date.now() + 60000),
        },
        { tokenHash: hash(state.adminToken), userId: state.adminId, expiresAt: new Date(Date.now() + 60000) },
      ],
    });
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (!state.db) return;
    try {
      if (!/^gf_test_transactions_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned test schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await state.db.$disconnect();
    }
  });

  it('단일 연결에서 다른 DB의 생성 결과를 읽고 함께 커밋해야 한다', async () => {
    const user = userData();
    const post = postData(user.id);
    const result = await state.work.run(async (client) => {
      await (client ?? state.auth).user.create({ data: user });
      const created = await (client ?? state.posts).post.create({ data: post });
      await (client ?? state.posts).notification.createMany({
        data: [{ userId: user.id, postId: created.id, type: 'FOLLOWED_POST', message: '원자적 알림' }],
      });
      expect(await (client ?? state.auth).user.findUnique({ where: { id: user.id } })).toMatchObject({
        id: user.id,
      });
      return created;
    });
    expect(result.id).toBe(post.id);
    expect(await state.db.post.findUnique({ where: { id: post.id } })).toMatchObject({ authorId: user.id });
    expect(await state.db.notification.count({ where: { userId: user.id, postId: post.id } })).toBe(1);
  });
  it('업무 오류가 발생하면 사용자·게시글·알림을 모두 롤백하고 원래 오류를 전파해야 한다', async () => {
    const user = userData();
    const post = postData(user.id);
    const failure = new Error('업무 취소');
    await expect(
      state.work.run(async (client) => {
        await (client ?? state.auth).user.create({ data: user });
        await (client ?? state.posts).post.create({ data: post });
        await (client ?? state.posts).notification.createMany({
          data: [{ userId: user.id, postId: post.id, type: 'FOLLOWED_POST', message: '롤백 대상' }],
        });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await state.db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await state.db.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect(await state.db.notification.count({ where: { postId: post.id } })).toBe(0);
  });
  it('배열 트랜잭션은 서로 다른 DB의 lazy query를 순서대로 커밋해야 한다', async () => {
    const user = userData();
    const post = postData(user.id);
    const [createdUser, createdPost] = await state.work.run([
      state.auth.user.create({ data: user }),
      state.posts.post.create({ data: post }),
    ]);
    expect(createdUser.id).toBe(user.id);
    expect(createdPost.authorId).toBe(user.id);
    expect(await state.db.post.findUnique({ where: { id: post.id } })).toMatchObject({ authorId: user.id });
  });
  it('배열의 뒤 쿼리에서 FK 오류가 나면 앞의 쓰기도 롤백해야 한다', async () => {
    const user = userData();
    const post = { ...postData(user.id), categoryId: randomUUID() };
    await expect(
      state.work.run([state.auth.user.create({ data: user }), state.posts.post.create({ data: post })]),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await state.db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await state.db.post.findUnique({ where: { id: post.id } })).toBeNull();
  });
  it('같은 트랜잭션에서 추가한 차단을 가시성 검사에 즉시 적용해야 한다', async () => {
    const blocks = state.app.get(PrismaClient);
    const session = await state.db.session.findUniqueOrThrow({
      where: { tokenHash: hash(state.accessToken) },
      include: { user: true },
    });
    const req = { gfSession: session } as SessionRequest;
    await state.work.run(async (client) => {
      await (client ?? blocks).block.upsert({
        where: { userId_blockedUserId: { userId: state.authorId, blockedUserId: state.readerId } },
        create: { userId: state.authorId, blockedUserId: state.readerId },
        update: {},
      });
      expect(await state.app.get(UserVisibilityService).excluded(req, client)).toContain(state.readerId);
      expect(
        await state.db.block.count({ where: { userId: state.authorId, blockedUserId: state.readerId } }),
      ).toBe(0);
    });
    await state.db.block.deleteMany({ where: { userId: state.authorId, blockedUserId: state.readerId } });
  });
  it('동일 시각의 글도 ID로 페이지를 나누고 숨긴 글·제외한 작성자를 노출하지 않아야 한다', async () => {
    const category = await state.db.category.create({
      data: { slug: 'repository-pagination', name: '정렬 검증' },
    });
    const createdAt = new Date('2026-10-19T01:00:00Z');
    await state.db.post.createMany({
      data: [
        ...['a', 'b', 'c'].map((id) => ({
          ...postData(state.authorId, `page-${id}`),
          categoryId: category.id,
          createdAt,
        })),
        { ...postData(state.authorId, 'page-hidden'), categoryId: category.id, createdAt, hidden: true },
        {
          ...postData(state.authorId, 'page-deleted'),
          categoryId: category.id,
          createdAt,
          deletedAt: new Date(),
        },
        { ...postData(state.readerId, 'page-excluded'), categoryId: category.id, createdAt },
      ],
    });
    const request = supertest(state.app.getHttpServer());
    const first = await request
      .get('/api/posts')
      .query({ board: 'ALL', category: category.slug, authorId: state.authorId, limit: 2 })
      .expect(200);
    const next = await request
      .get('/api/posts')
      .query({
        board: 'ALL',
        category: category.slug,
        authorId: state.authorId,
        limit: 2,
        cursor: first.body.nextCursor,
      })
      .expect(200);
    expect(first.body.items.map((post: { id: string }) => post.id)).toEqual(['page-c', 'page-b']);
    expect(next.body.items.map((post: { id: string }) => post.id)).toEqual(['page-a']);
    expect(next.body.nextCursor).toBeNull();
    await state.db.block.create({ data: { userId: state.authorId, blockedUserId: state.readerId } });
    const visible = await request
      .get('/api/posts')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .query({ board: 'ALL', category: category.slug, limit: 10 })
      .expect(200);
    expect(visible.body.items.map(({ id }: { id: string }) => id)).toEqual(['page-c', 'page-b', 'page-a']);
    await state.db.block.deleteMany({ where: { userId: state.authorId, blockedUserId: state.readerId } });
  });
  it('기록 삭제의 동일 시각 경계를 내 DB 조회에만 적용해야 한다', async () => {
    const at = new Date('2026-10-19T01:00:00Z');
    const conversation = await state.db.chatConversation.create({
      data: {
        firstUserId: state.authorId,
        secondUserId: state.readerId,
        firstClearedAt: at,
        firstClearedId: 'history-b',
      },
      include: { support: true },
    });
    await state.db.chatMessage.createMany({
      data: ['a', 'b', 'c'].map((id) => ({
        id: `history-${id}`,
        conversationId: conversation.id,
        senderId: state.readerId,
        clientMessageId: randomUUID(),
        body: id,
        createdAt: at,
      })),
    });
    const repository = state.app.get(PrismaClient);
    const mine = await repository.chatMessage.findMany({
      where: { conversationId: conversation.id, ...historyWhere(conversation, state.authorId) },
      orderBy: { id: 'asc' },
    });
    const peer = await repository.chatMessage.findMany({
      where: { conversationId: conversation.id, ...historyWhere(conversation, state.readerId) },
      orderBy: { id: 'asc' },
    });
    expect(mine.map(({ id }) => id)).toEqual(['history-c']);
    expect(peer.map(({ id }) => id)).toEqual(['history-a', 'history-b', 'history-c']);
  });

  const moderationFixture = async () => {
    const post = await state.db.post.create({ data: postData(state.authorId) });
    const unrelated = await state.db.post.create({ data: postData(state.authorId) });
    const answer = await state.db.answer.create({
      data: { postId: post.id, authorId: state.readerId, body: '검토할 답변' },
    });
    const comment = await state.db.comment.create({
      data: { postId: post.id, authorId: state.readerId, body: '검토할 댓글' },
    });
    await state.db.notification.createMany({
      data: [
        {
          id: `${post.id}-post`,
          userId: state.authorId,
          postId: post.id,
          type: 'FOLLOWED_POST',
          message: '글 알림',
        },
        {
          id: `${post.id}-answer`,
          userId: state.authorId,
          postId: post.id,
          answerId: answer.id,
          type: 'ANSWER',
          message: '답변 알림',
        },
        {
          id: `${post.id}-other`,
          userId: state.authorId,
          postId: unrelated.id,
          type: 'FOLLOWED_POST',
          message: '다른 글 알림',
        },
      ],
    });
    return { post, unrelated, answer, comment };
  };
  it.each(['POST', 'ANSWER', 'COMMENT'] as const)(
    '%s 숨김과 해제에서 해당 콘텐츠·알림·감사 기록만 변경해야 한다',
    async (targetType) => {
      const { post, answer, comment } = await moderationFixture();
      const targetId = { POST: post.id, ANSWER: answer.id, COMMENT: comment.id }[targetType];
      const hide = (hidden: boolean) =>
        supertest(state.app.getHttpServer())
          .post('/api/admin/hide')
          .set('Origin', origin)
          .set('Authorization', `Bearer ${state.adminToken}`)
          .send({ targetType, targetId, hidden, reason: 'DB 운영 검토' })
          .expect(200);
      await hide(true);
      expect((await state.db.post.findUniqueOrThrow({ where: { id: post.id } })).hidden).toBe(
        targetType === 'POST',
      );
      expect((await state.db.answer.findUniqueOrThrow({ where: { id: answer.id } })).hidden).toBe(
        targetType === 'ANSWER',
      );
      expect((await state.db.comment.findUniqueOrThrow({ where: { id: comment.id } })).hidden).toBe(
        targetType === 'COMMENT',
      );
      const notifications = await state.db.notification.findMany({
        where: { id: { startsWith: post.id } },
        orderBy: { id: 'asc' },
      });
      const expected =
        targetType === 'POST'
          ? ['other']
          : targetType === 'ANSWER'
            ? ['other', 'post']
            : ['answer', 'other', 'post'];
      expect(notifications.map(({ id }) => id.slice(post.id.length + 1))).toEqual(expected);
      await state.db.notification.create({
        data: {
          id: `${post.id}-preserve`,
          userId: state.authorId,
          postId: post.id,
          answerId: answer.id,
          type: 'ANSWER',
          message: '해제 시 보존',
        },
      });
      await hide(false);
      expect(await state.db.notification.findUnique({ where: { id: `${post.id}-preserve` } })).not.toBeNull();
      expect(
        await state.db.auditLog.count({
          where: { targetId, actorId: state.adminId, action: { in: ['HIDE', 'UNHIDE'] } },
        }),
      ).toBe(2);
    },
  );
  it('감사 기록 저장이 실패하면 숨김과 알림 삭제도 함께 롤백해야 한다', async () => {
    const { post } = await moderationFixture();
    await state.db.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ADD CONSTRAINT repo_audit_failure CHECK (detail <> 'reject-repository-audit')`,
    );
    try {
      await supertest(state.app.getHttpServer())
        .post('/api/admin/hide')
        .set('Origin', origin)
        .set('Authorization', `Bearer ${state.adminToken}`)
        .send({ targetType: 'POST', targetId: post.id, hidden: true, reason: 'reject-repository-audit' })
        .expect(500);
      expect((await state.db.post.findUniqueOrThrow({ where: { id: post.id } })).hidden).toBe(false);
      expect(await state.db.notification.count({ where: { postId: post.id } })).toBe(2);
      expect(await state.db.auditLog.count({ where: { targetId: post.id } })).toBe(0);
    } finally {
      await state.db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT repo_audit_failure');
    }
  });
  it('일반 사용자의 운영 요청과 알 수 없는 콘텐츠 유형을 거부해야 한다', async () => {
    const post = await state.db.post.create({ data: postData(state.authorId) });
    const input = { targetType: 'POST', targetId: post.id, hidden: true, reason: '권한 확인' };
    await supertest(state.app.getHttpServer())
      .post('/api/admin/hide')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send(input)
      .expect(403);
    await supertest(state.app.getHttpServer())
      .post('/api/admin/hide')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${state.adminToken}`)
      .send({ ...input, targetType: 'USER' })
      .expect(400);
    expect((await state.db.post.findUniqueOrThrow({ where: { id: post.id } })).hidden).toBe(false);
    expect(await state.db.auditLog.count({ where: { targetId: post.id } })).toBe(0);
  });
  it('신고의 네 대상 분기를 검증하고 중복 신고를 한 행으로 유지해야 한다', async () => {
    const { post, answer, comment } = await moderationFixture();
    const request = supertest(state.app.getHttpServer());
    const targets = [
      ['POST', post.id],
      ['ANSWER', answer.id],
      ['COMMENT', comment.id],
      ['USER', state.readerId],
    ] as const;
    await Promise.all(
      targets.map(async ([targetType, targetId]) => {
        const send = () =>
          request
            .post('/api/reports')
            .set('Origin', origin)
            .set('Authorization', `Bearer ${state.accessToken}`)
            .send({ targetType, targetId, reason: 'OTHER' })
            .expect(200);
        await send();
        await send();
        expect(
          await state.db.report.count({ where: { targetType, targetId, reporterId: state.authorId } }),
        ).toBe(1);
      }),
    );
    await request
      .post('/api/reports')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .send({ targetType: 'USER', targetId: state.authorId, reason: 'OTHER' })
      .expect(400);
    const secondToken = token();
    await state.db.session.create({
      data: { tokenHash: hash(secondToken), userId: state.readerId, expiresAt: new Date(Date.now() + 60000) },
    });
    await request
      .post('/api/reports')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ targetType: 'POST', targetId: post.id, reason: 'OTHER' })
      .expect(200);
    const reports = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${state.adminToken}`)
      .expect(200);
    expect(
      reports.body.items.filter(
        (report: { targetType: string; targetId: string }) =>
          report.targetType === 'POST' && report.targetId === post.id,
      ),
    ).toHaveLength(2);
    expect(reports.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'POST',
          targetId: post.id,
          targetUserId: state.authorId,
          targetPostId: post.id,
        }),
        expect.objectContaining({
          targetType: 'ANSWER',
          targetId: answer.id,
          targetUserId: state.readerId,
          targetPostId: post.id,
        }),
        expect.objectContaining({
          targetType: 'COMMENT',
          targetId: comment.id,
          targetUserId: state.readerId,
          targetPostId: post.id,
        }),
        expect.objectContaining({
          targetType: 'USER',
          targetId: state.readerId,
          targetUserId: state.readerId,
          targetPostId: null,
        }),
      ]),
    );
  });
});
