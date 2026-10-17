import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import { createApp } from './app';
import { seed } from './seed';
import { assertDatabaseUrl } from './security';

const target = process.env.TEST_DATABASE_URL;
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
describe.skipIf(!target)('community boards and rich text with isolated PostgreSQL', () => {
  let app: INestApplication,
    db: PrismaClient,
    schema: string,
    author: ReturnType<typeof supertest.agent>,
    categoryId: string;
  beforeAll(async () => {
    const url = new URL(target ?? '');
    schema = `gf_test_community_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = url.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0) throw new Error('Isolated community migration failed');
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
      if (!/^gf_test_community_[a-f0-9]+$/.test(schema)) throw new Error('Unowned schema');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  it('separates every board from feedback and persists formatting through detail and edit', async () => {
    const body = '함께 친선전을 연습할 상대를 찾습니다. 저녁에 편하게 이야기해주세요.';
    for (const board of ['FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE']) {
      const document = { ops: [{ insert: body, attributes: { bold: true } }, { insert: '\n' }] };
      const created = (
        await author
          .post('/api/posts')
          .set('Origin', origin)
          .send({
            categoryId,
            board,
            title: `${board} 모집 게시글`,
            body,
            document,
            ...(board === 'COACHING' ? { coaching: { role: 'COACH', hourlyRate: 30000 } } : {}),
            ...(board === 'FRIEND_SALE' ? { friendSale: { price: 12000 } } : {}),
          })
          .expect(200)
      ).body;
      expect(created).toMatchObject({ board, body, document });
      const list = (await author.get('/api/posts').query({ board }).expect(200)).body;
      expect(list.items.some((post: { id: string }) => post.id === created.id)).toBe(true);
      const feedback = (await author.get('/api/posts').expect(200)).body;
      expect(feedback.items.some((post: { id: string }) => post.id === created.id)).toBe(false);
      const detail = (await author.get(`/api/posts/${created.id}`).expect(200)).body;
      expect(detail.post.document).toEqual(document);
      const updated = '모집 내용을 수정했습니다. 함께 연습할 분은 채팅으로 연락해주세요.';
      const patched = (
        await author
          .patch(`/api/posts/${created.id}`)
          .set('Origin', origin)
          .send({ body: updated, document: { ops: [{ insert: updated + '\n' }] } })
          .expect(200)
      ).body;
      expect(patched.body).toBe(updated);
      await author
        .patch(`/api/posts/${created.id}`)
        .set('Origin', origin)
        .send({ body, document: null })
        .expect(200);
      expect((await author.get(`/api/posts/${created.id}`)).body.post.document).toBeNull();
    }
  });
  it('rejects unknown boards, executable links, embedded HTML objects and mismatched plain text', async () => {
    const input = {
      categoryId,
      title: '입력 검증 게시글',
      body: '서식을 포함한 본문을 안전하게 검증하는 게시글입니다.',
    };
    for (const board of ['UNKNOWN', 'ACCOUNT_TRADE', 'FRIEND', 'SALE']) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, board })
        .expect(400);
      await author.get('/api/posts').query({ board }).expect(400);
    }
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        ...input,
        document: {
          ops: [{ insert: input.body, attributes: { link: 'javascript:alert(1)' } }, { insert: '\n' }],
        },
      })
      .expect(400);
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, document: { ops: [{ insert: { image: 'data:text/html,unsafe' } }] } })
      .expect(400);
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, document: { ops: [{ insert: '다른 본문\n' }] } })
      .expect(400);
  });
  it('requires valid paid coaching terms for both coaches and students and keeps them through edits', async () => {
    const input = {
      categoryId,
      board: 'COACHING',
      title: '코치와 수강생 모집',
      body: '배우고 싶은 분야와 진행 방식, 수강료를 채팅으로 상담합니다.',
    };
    await author.post('/api/posts').set('Origin', origin).send(input).expect(400);
    for (const hourlyRate of [0, -1, 10000001, '30000']) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, coaching: { role: 'COACH', hourlyRate } })
        .expect(400);
    }
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, board: 'FREE', coaching: { role: 'COACH', hourlyRate: 30000 } })
      .expect(400);
    const created = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, coaching: { role: 'STUDENT', hourlyRate: 50000 } })
        .expect(200)
    ).body;
    expect(created.coaching).toEqual({ role: 'STUDENT', hourlyRate: 50000 });
    await author.patch(`/api/posts/${created.id}`).set('Origin', origin).send({ coaching: null }).expect(400);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ coaching: { role: 'COACH', hourlyRate: null } })
      .expect(200);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ title: '수강료 협의 후 진행하는 코칭' })
      .expect(200);
    expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.coaching).toEqual({
      role: 'COACH',
      hourlyRate: null,
    });
  });
  it('persists strict friend slot prices through creation, edits and lists while preserving legacy posts', async () => {
    const input = {
      categoryId,
      board: 'FRIEND_SALE',
      title: '친구 슬롯 판매 금액 안내',
      body: '판매 조건과 기간을 확인하고 궁금한 내용은 채팅으로 문의해주세요.',
    };
    await author.post('/api/posts').set('Origin', origin).send(input).expect(400);
    for (const friendSale of [
      null,
      {},
      { price: 0 },
      { price: -1 },
      { price: 1.5 },
      { price: 10000001 },
      { price: '12000' },
      { price: 12000, currency: 'KRW' },
    ]) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, friendSale })
        .expect(400);
    }
    const created = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, friendSale: { price: 12000 } })
        .expect(200)
    ).body;
    expect(created.friendSale).toEqual({ price: 12000 });
    for (const friendSale of [null, { price: 0 }, { price: '18000' }]) {
      await author.patch(`/api/posts/${created.id}`).set('Origin', origin).send({ friendSale }).expect(400);
    }
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ friendSale: { price: 18000 } })
      .expect(200);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ title: '금액을 수정한 친구 슬롯 판매' })
      .expect(200);
    expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.friendSale).toEqual({
      price: 18000,
    });
    const listed = (await author.get('/api/posts').query({ board: 'ALL' }).expect(200)).body.items;
    expect(listed.find((post: { id: string }) => post.id === created.id).friendSale).toEqual({
      price: 18000,
    });
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ friendSale: { price: null } })
      .expect(200);
    expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.friendSale).toEqual({
      price: null,
    });
    const general = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, board: 'FREE' })
        .expect(200)
    ).body;
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, board: 'FREE', friendSale: { price: 12000 } })
      .expect(400);
    await author
      .patch(`/api/posts/${general.id}`)
      .set('Origin', origin)
      .send({ friendSale: { price: 12000 } })
      .expect(400);
    const legacy = await db.post.create({
      data: {
        authorId: created.author.id,
        categoryId,
        board: 'FRIEND_SALE',
        title: input.title,
        body: input.body,
      },
    });
    expect((await author.get(`/api/posts/${legacy.id}`).expect(200)).body.post.friendSale).toBeNull();
    await author
      .patch(`/api/posts/${legacy.id}`)
      .set('Origin', origin)
      .send({ title: '기존 친추판매 글 제목 수정' })
      .expect(200);
    expect((await author.get(`/api/posts/${legacy.id}`).expect(200)).body.post.friendSale).toBeNull();
    await author
      .patch(`/api/posts/${legacy.id}`)
      .set('Origin', origin)
      .send({ friendSale: { price: 10000000 } })
      .expect(200);
  });
  it('uses the same five board kinds for another game and keeps game filters isolated', async () => {
    const category = await db.category.create({
      data: { slug: 'another-game', name: 'Another Game', active: true },
    });
    for (const board of ['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE']) {
      const input = {
        categoryId: category.id,
        board,
        title: `다른 게임 ${board} 게시글`,
        body: '모든 게임에서 공통 게시판을 사용하며 게임별로 글을 분리합니다.',
        ...(board === 'COACHING' ? { coaching: { role: 'STUDENT', hourlyRate: null } } : {}),
        ...(board === 'FRIEND_SALE' ? { friendSale: { price: null } } : {}),
      };
      const created = (await author.post('/api/posts').set('Origin', origin).send(input).expect(200)).body;
      const own = (await author.get('/api/posts').query({ board, category: category.slug }).expect(200)).body;
      expect(own.items.map((post: { id: string }) => post.id)).toContain(created.id);
      const other = (await author.get('/api/posts').query({ board, category: 'clash-royale' }).expect(200))
        .body;
      expect(other.items.map((post: { id: string }) => post.id)).not.toContain(created.id);
    }
    const result = (
      await author.get('/api/posts').query({ board: 'ALL', category: category.slug }).expect(200)
    ).body;
    expect(result.items).toHaveLength(5);
  });
  it('keeps retired listings in storage while excluding them from every public surface', async () => {
    const userId = (await author.get('/api/session').expect(200)).body.user.id;
    const before = (await author.get(`/api/users/${userId}`).expect(200)).body;
    const retired = await db.post.create({
      data: {
        categoryId,
        authorId: userId,
        board: 'ACCOUNT_TRADE',
        title: 'Retired account listing',
        body: 'This historical listing should remain private after its board is removed.',
      },
    });
    await db.notification.create({
      data: { userId, postId: retired.id, type: 'COMMENT', message: retired.title },
    });
    for (const query of [{ board: 'ALL' }, { authorId: userId }, { board: 'ALL', q: retired.title }]) {
      const list = (await author.get('/api/posts').query(query).expect(200)).body;
      expect(list.items.some((post: { id: string }) => post.id === retired.id)).toBe(false);
    }
    await author.get(`/api/posts/${retired.id}`).expect(404);
    await author
      .post(`/api/posts/${retired.id}/comments`)
      .set('Origin', origin)
      .send({ body: 'This comment must not be accepted.' })
      .expect(404);
    const profile = (await author.get(`/api/users/${userId}`).expect(200)).body;
    expect(profile.postCount).toBe(before.postCount);
    const notifications = (await author.get('/api/notifications').expect(200)).body;
    expect(notifications.items.some((item: { postId: string }) => item.postId === retired.id)).toBe(false);
    expect(notifications.unreadCount).toBe(0);
    expect(await db.post.findUnique({ where: { id: retired.id } })).toMatchObject({ board: 'ACCOUNT_TRADE' });
  });
});
