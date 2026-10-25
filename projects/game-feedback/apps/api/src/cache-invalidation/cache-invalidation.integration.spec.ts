import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnswerSchema,
  CacheRevalidationSchema,
  CommentSchema,
  postCacheTag,
  PostSchema,
} from '@game-feedback/contracts';

import { createApp, type AppOptions } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { seed } from '../seed';
import { CacheInvalidationService } from './cache-invalidation.service';

const target = process.env.DATABASE_URL;
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const secret = 'isolated-cache-callback-secret-'.repeat(2);
type TAgent = ReturnType<typeof supertest.agent>;

describe.skipIf(!target)('transactional cache invalidation with deployed migrations', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let server: Server;
  let schema: string;
  let options: AppOptions;
  let cache: CacheInvalidationService;
  let writer: TAgent;
  let coach: TAgent;
  let admin: TAgent;
  let status = 200;
  let now = Date.now();
  let pauseNext = false;
  let notifyPaused = () => {};
  let resumePaused = () => {};
  let paused = Promise.resolve();
  const callbacks: Array<{ tags: string[]; title: string | null }> = [];

  async function account(accountId: string) {
    const agent = supertest.agent(app.getHttpServer());
    await agent.post('/api/auth/test-token').set('Origin', origin).send({ accountId }).expect(200);
    return agent;
  }
  async function post() {
    const response = await writer
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        title: '커밋된 게시글',
        body: 'DB 변경이 커밋된 뒤 캐시를 만료합니다.',
        categoryId: 'clash-royale',
      })
      .expect(200);
    return PostSchema.parse(response.body);
  }
  function tags() {
    return callbacks.flatMap((event) => event.tags);
  }

  beforeAll(async () => {
    const url = new URL(target ?? '');
    schema = `gf_test_cache_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0) throw new Error('Cache invalidation migration setup failed.');
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(db, true);
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      if (req.headers.authorization !== `Bearer ${secret}`) {
        res.writeHead(401).end();
        return;
      }
      const { tags: incoming } = CacheRevalidationSchema.parse(JSON.parse(body));
      const postId = incoming.find((tag) => tag.startsWith('post:'))?.slice(5);
      const row = postId
        ? await db.post.findUnique({ where: { id: postId }, select: { title: true } })
        : null;
      callbacks.push({ tags: incoming, title: row?.title ?? null });
      const responseStatus = status;
      if (pauseNext) {
        pauseNext = false;
        notifyPaused();
        await paused;
      }
      res.writeHead(responseStatus, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an isolated HTTP fixture.');
    options = {
      databaseUrl,
      prisma: db,
      webOrigin: origin,
      demoMode: true,
      rateLimit: false,
      cacheRevalidation: { url: `http://127.0.0.1:${address.port}/internal/cache/revalidate`, secret },
    };
    app = await createApp(options);
    cache = app.get(CacheInvalidationService);
    writer = await account('sample-user-0');
    coach = await account('sample-user-3');
    admin = await account('sample-test-admin');
  }, 30_000);
  beforeEach(async () => {
    now += 10_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await db.cacheInvalidation.deleteMany();
    callbacks.length = 0;
    status = 200;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    resumePaused();
    await app?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (db) {
      if (!/^gf_test_cache_[a-f0-9]+$/.test(schema)) throw new Error('Unowned schema.');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });

  it('delivers committed post creation, editing and deletion and acknowledges successful tags', async () => {
    const created = await post();
    expect(tags()).toEqual(expect.arrayContaining([postCacheTag(created.id), 'discovery']));
    expect(callbacks.at(-1)?.title).toBe('커밋된 게시글');
    callbacks.length = 0;
    await writer
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ title: '수정 커밋 완료' })
      .expect(200);
    expect(callbacks.at(-1)?.title).toBe('수정 커밋 완료');
    expect(tags()).toContain(postCacheTag(created.id));
    callbacks.length = 0;
    await writer.delete(`/api/posts/${created.id}`).set('Origin', origin).expect(200);
    expect(tags()).toContain(postCacheTag(created.id));
    expect(await db.cacheInvalidation.count()).toBe(0);
  });

  it('invalidates parent posts for answer/comment changes, helpful status and answer reads', async () => {
    const created = await post();
    const answer = AnswerSchema.parse(
      (
        await coach
          .post(`/api/posts/${created.id}/answers`)
          .set('Origin', origin)
          .send({ body: '상대의 공격을 먼저 막고 천천히 운영하세요.' })
          .expect(200)
      ).body,
    );
    const comment = CommentSchema.parse(
      (
        await coach
          .post(`/api/posts/${created.id}/comments`)
          .set('Origin', origin)
          .send({ body: '댓글을 남겨요.' })
          .expect(200)
      ).body,
    );
    for (const request of [
      () =>
        coach
          .patch(`/api/answers/${answer.id}`)
          .set('Origin', origin)
          .send({ body: '수정한 피드백도 실제 캐시에 반영됩니다.' }),
      () => writer.post(`/api/posts/${created.id}/read`).set('Origin', origin),
      () => writer.post(`/api/answers/${answer.id}/helpful`).set('Origin', origin).send({ helpful: true }),
      () => coach.patch(`/api/comments/${comment.id}`).set('Origin', origin).send({ body: '수정한 댓글' }),
      () => coach.delete(`/api/comments/${comment.id}`).set('Origin', origin),
      () => coach.delete(`/api/answers/${answer.id}`).set('Origin', origin),
    ]) {
      callbacks.length = 0;
      await request().expect(200);
      expect(tags()).toContain(postCacheTag(created.id));
    }
  });

  it('covers administrator visibility and public author metadata changes', async () => {
    const created = await post();
    callbacks.length = 0;
    await admin
      .post('/api/admin/hide')
      .set('Origin', origin)
      .send({ targetType: 'POST', targetId: created.id, hidden: true, reason: '캐시 무효화 검증' })
      .expect(200);
    expect(tags()).toContain(postCacheTag(created.id));
    callbacks.length = 0;
    await admin
      .patch('/api/admin/users/sample-user-0/verification')
      .set('Origin', origin)
      .send({ isVerified: true })
      .expect(200);
    expect(tags()).toContain('posts');
  });

  it('does not send or retain an event when the business transaction rolls back', async () => {
    const id = `rollback-${randomBytes(4).toString('hex')}`;
    await expect(
      cache.change(
        async (tx) => {
          await tx.category.create({ data: { id, slug: id, name: '롤백' } });
          throw new Error('rollback');
        },
        ['posts'],
      ),
    ).rejects.toThrow('rollback');
    expect(await db.category.findUnique({ where: { id } })).toBeNull();
    expect(await db.cacheInvalidation.count()).toBe(0);
    expect(callbacks).toEqual([]);
  });

  it('keeps failed callbacks durable without failing the write and retries them after an application restart', async () => {
    status = 503;
    const created = await post();
    expect(await db.post.findUnique({ where: { id: created.id } })).not.toBeNull();
    expect(await db.cacheInvalidation.count()).toBeGreaterThan(0);
    status = 200;
    const restarted = await createApp(options);
    try {
      await restarted.get(CacheInvalidationService).flushPending();
      expect(await db.cacheInvalidation.count()).toBe(0);
    } finally {
      await restarted.close();
    }
  });

  it('does not acknowledge a newer commit when an earlier callback finishes late', async () => {
    const tag = postCacheTag('overlapping-write');
    const started = new Promise<void>((resolve) => {
      notifyPaused = resolve;
    });
    paused = new Promise<void>((resolve) => {
      resumePaused = resolve;
    });
    pauseNext = true;
    const first = cache.change(async () => 1, [tag]);
    await started;
    status = 503;
    await cache.change(async () => 2, [tag]);
    const pending = await db.cacheInvalidation.findUniqueOrThrow({ where: { tag } });
    resumePaused();
    await first;
    expect((await db.cacheInvalidation.findUniqueOrThrow({ where: { tag } })).revision).toBe(
      pending.revision,
    );
    status = 200;
    vi.spyOn(Date, 'now').mockReturnValue(now + 6_000);
    await cache.flushPending();
    expect(await db.cacheInvalidation.count()).toBe(0);
  });
});
