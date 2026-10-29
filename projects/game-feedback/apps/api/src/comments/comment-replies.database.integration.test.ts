import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommentPageSchema, PostDetailSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_reply_pages_${randomBytes(8).toString('hex')}`;
type Agent = ReturnType<typeof supertest.agent>;
const state: {
  app?: INestApplication;
  db?: PrismaClient;
  agent?: Agent;
  viewerId?: string;
  authorId?: string;
  categoryId?: string;
} = {};

function fixture() {
  const { app, db, agent, viewerId, authorId, categoryId } = state;
  if (!app || !db || !agent || !viewerId || !authorId || !categoryId)
    throw new Error('Missing reply fixtures');
  return { app, db, agent, viewerId, authorId, categoryId };
}

async function thread() {
  const { db, authorId, categoryId } = fixture();
  const post = await db.post.create({
    data: { authorId, categoryId, title: '답글 페이지 검증', body: '본문', board: 'FREE' },
  });
  const root = await db.comment.create({ data: { authorId, postId: post.id, body: '원댓글' } });
  return { post, root };
}

describe('bounded reply pages preserve every visible reply', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('schema', schema);
    const databaseUrl = url.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0)
      throw new Error(`Reply migration failed: ${migration.stderr}\n${migration.stdout}`);
    const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    state.db = db;
    await seed(db, false);
    const app = await createApp({
      databaseUrl,
      prisma: db,
      demoMode: true,
      rateLimit: false,
      webOrigin: origin,
    });
    state.app = app;
    const agent = supertest.agent(app.getHttpServer());
    const session = SessionSchema.parse(
      (
        await agent
          .post('/api/auth/demo')
          .set('Origin', origin)
          .send({ nickname: '답글페이지방문자' })
          .expect(200)
      ).body,
    );
    if (!session.user) throw new Error('Expected signed-in viewer');
    state.agent = agent;
    state.viewerId = session.user.id;
    state.authorId = (
      await db.user.create({
        data: { nickname: '답글페이지작성자', termsVersion: 'test', ageConfirmed: true },
      })
    ).id;
    state.categoryId = (await db.category.findFirstOrThrow({ where: { active: true } })).id;
  }, 60_000);

  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_reply_pages_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned reply schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('retrieves all 201 replies through bounded pages and keeps another root visible', async () => {
    const { db, agent, authorId } = fixture();
    const { post, root } = await thread();
    const createdAt = new Date('2026-10-29T00:00:00.000Z');
    const replies = Array.from({ length: 201 }, (_, index) => ({
      id: `${root.id}-reply-${String(index).padStart(3, '0')}`,
      authorId,
      postId: post.id,
      parentId: root.id,
      body: `답글 ${index}`,
      createdAt,
    }));
    await db.comment.createMany({ data: replies });
    const other = await db.comment.create({ data: { authorId, postId: post.id, body: '다른 원댓글' } });
    const otherReply = await db.comment.create({
      data: { authorId, postId: post.id, parentId: other.id, body: '다른 스레드 답글' },
    });
    const detail = PostDetailSchema.parse((await agent.get(`/api/posts/${post.id}`).expect(200)).body);
    const preview = detail.comments.filter((item) => item.parentId === root.id);
    const rootDto = detail.comments.find((item) => item.id === root.id);
    expect(preview).toHaveLength(6);
    expect(rootDto).toMatchObject({ replyCount: 201, repliesCursor: expect.any(String) });
    expect(detail.comments.some((item) => item.id === otherReply.id)).toBe(true);
    const loaded = new Set(preview.map((item) => item.id));
    async function previous(cursor: string): Promise<void> {
      const page = CommentPageSchema.parse(
        (await agent.get(`/api/comments/${root.id}/replies`).query({ cursor, limit: 50 }).expect(200)).body,
      );
      expect(page.items.length).toBeLessThanOrEqual(50);
      expect(
        page.items.every(
          (item) => item.parentId === root.id && item.replyCount === 0 && item.repliesCursor === null,
        ),
      ).toBe(true);
      expect(page.items.map((item) => item.id)).toEqual(page.items.map((item) => item.id).sort());
      for (const item of page.items) {
        expect(loaded.has(item.id)).toBe(false);
        loaded.add(item.id);
      }
      if (page.nextCursor) await previous(page.nextCursor);
    }
    if (!rootDto?.repliesCursor) throw new Error('Expected earlier replies');
    await previous(rootDto.repliesCursor);
    expect([...loaded].sort()).toEqual(replies.map((item) => item.id).sort());
    const roots = CommentPageSchema.parse(
      (await agent.get(`/api/posts/${post.id}/comments`).query({ limit: 30 }).expect(200)).body,
    );
    expect(roots.items.find((item) => item.id === root.id)).toMatchObject({
      replyCount: 201,
      repliesCursor: expect.any(String),
    });
  });

  it('applies post, root and reply visibility while allowing deleted anonymous roots', async () => {
    const { db, agent, authorId, viewerId } = fixture();
    const { post, root } = await thread();
    const reply = await db.comment.create({
      data: { authorId: viewerId, postId: post.id, parentId: root.id, body: '남는 답글' },
    });
    await db.comment.create({
      data: { authorId, postId: post.id, parentId: root.id, body: '숨긴 답글', hidden: true },
    });
    await db.comment.create({
      data: { authorId, postId: post.id, parentId: root.id, body: '삭제한 답글', deletedAt: new Date() },
    });
    const endpoint = `/api/comments/${root.id}/replies`;
    expect(
      CommentPageSchema.parse((await agent.get(endpoint).expect(200)).body).items.map((item) => item.id),
    ).toEqual([reply.id]);
    await agent.get(endpoint).query({ cursor: 'broken' }).expect(400);
    await agent.get(endpoint).query({ limit: 51 }).expect(400);
    await agent.get(`/api/comments/${reply.id}/replies`).expect(404);
    await agent.get('/api/comments/missing/replies').expect(404);
    await db.comment.update({ where: { id: root.id }, data: { hidden: true } });
    await agent.get(endpoint).expect(404);
    await db.comment.update({ where: { id: root.id }, data: { hidden: false } });
    await db.post.update({ where: { id: post.id }, data: { authorId: viewerId } });
    await db.comment.create({
      data: { authorId, postId: post.id, parentId: root.id, body: '차단할 작성자의 답글' },
    });
    const block = await db.block.create({ data: { userId: viewerId, blockedUserId: authorId } });
    await agent.get(endpoint).expect(404);
    await db.comment.update({ where: { id: root.id }, data: { deletedAt: new Date(), body: '' } });
    expect(
      CommentPageSchema.parse((await agent.get(endpoint).expect(200)).body).items.map((item) => item.id),
    ).toEqual([reply.id]);
    await db.block.delete({ where: { id: block.id } });
    expect(CommentPageSchema.parse((await agent.get(endpoint).expect(200)).body).items).toHaveLength(2);
    await db.post.update({ where: { id: post.id }, data: { hidden: true } });
    await agent.get(endpoint).expect(404);
    await db.post.update({ where: { id: post.id }, data: { hidden: false } });
    await db.comment.update({ where: { id: reply.id }, data: { deletedAt: new Date(), body: '' } });
    expect(CommentPageSchema.parse((await agent.get(endpoint).expect(200)).body).items).toHaveLength(1);
    await db.comment.updateMany({ where: { parentId: root.id }, data: { deletedAt: new Date(), body: '' } });
    await agent.get(endpoint).expect(404);
  });
});
