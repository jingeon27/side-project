import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

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
    const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push'], {
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    });
    if (migration.status !== 0) throw new Error('Isolated community schema setup failed');
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
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
  it('creates and edits a one-character post while rejecting empty, oversized and mismatched content', async () => {
    const input = {
      categoryId,
      board: 'FREE',
      title: '짧은 본문 등록 확인',
      body: '안',
      document: { ops: [{ insert: '안\n' }] },
    };
    const created = (await author.post('/api/posts').set('Origin', origin).send(input).expect(200)).body;
    expect(created.body).toBe('안');
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ body: 'x', document: { ops: [{ insert: 'x\n' }] } })
      .expect(200);
    expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.body).toBe('x');
    for (const body of ['', '   ', 'x'.repeat(10001)]) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, body, document: null })
        .expect(400);
      await author
        .patch(`/api/posts/${created.id}`)
        .set('Origin', origin)
        .send({ body, document: null })
        .expect(400);
    }
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, body: '다' })
      .expect(400);
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
            ...(board === 'COACHING'
              ? { coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: 30000 } } }
              : {}),
            ...(board === 'FRIEND_SALE' ? { friendSale: { price: 12000 } } : {}),
            ...(board === 'FRIENDLY' ? { battle: { mode: 'DUEL' } } : {}),
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
    for (const amount of [0, -1, 1.5, 10000001, '30000']) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount } } })
        .expect(400);
    }
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        ...input,
        board: 'FREE',
        coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: 30000 } },
      })
      .expect(400);
    const created = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, coaching: { role: 'STUDENT', pricing: { type: 'HOURLY', amount: 50000 } } })
        .expect(200)
    ).body;
    expect(created.coaching).toEqual({ role: 'STUDENT', pricing: { type: 'HOURLY', amount: 50000 } });
    await author.patch(`/api/posts/${created.id}`).set('Origin', origin).send({ coaching: null }).expect(400);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: null } } })
      .expect(200);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ title: '수강료 협의 후 진행하는 코칭' })
      .expect(200);
    expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.coaching).toEqual({
      role: 'COACH',
      pricing: { type: 'HOURLY', amount: null },
    });
  });

  it('stores hourly, monthly and goal totals for coaches and students and rejects ambiguous terms', async () => {
    const input = {
      categoryId,
      board: 'COACHING',
      title: '여러 기준의 유료 코칭',
      body: '기간과 목표에 맞게 코치와 수강생이 수강료를 정하고 상담합니다.',
    };
    for (const role of ['COACH', 'STUDENT']) {
      for (const pricing of [
        { type: 'HOURLY', amount: 35000 },
        { type: 'MONTHLY', amount: 250000 },
        { type: 'GOAL', amount: 500000, targetScore: '9,000 트로피' },
        { type: 'MONTHLY', amount: null },
        { type: 'GOAL', amount: null, targetScore: '다이아몬드' },
      ]) {
        const coaching = { role, pricing };
        const created = (
          await author
            .post('/api/posts')
            .set('Origin', origin)
            .send({ ...input, coaching })
            .expect(200)
        ).body;
        expect(created.coaching).toEqual(coaching);
        await author
          .patch(`/api/posts/${created.id}`)
          .set('Origin', origin)
          .send({ title: '진행 조건을 보존하는 코칭' })
          .expect(200);
        expect((await author.get(`/api/posts/${created.id}`).expect(200)).body.post.coaching).toEqual(
          coaching,
        );
      }
    }
    for (const pricing of [
      { type: 'MONTHLY', amount: '250000' },
      { type: 'MONTHLY', amount: 0 },
      { type: 'GOAL', amount: -1, targetScore: '9000' },
      { type: 'GOAL', amount: 500000 },
      { type: 'GOAL', amount: null, targetScore: '   ' },
      { type: 'GOAL', amount: 500000, targetScore: 9000 },
      { type: 'GOAL', amount: 500000, targetScore: 'x'.repeat(101) },
      { type: 'MONTHLY', amount: 250000, targetScore: '9000' },
      { type: 'OTHER', amount: 30000 },
    ])
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, coaching: { role: 'COACH', pricing } })
        .expect(400);
    const post = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({
          ...input,
          coaching: { role: 'COACH', pricing: { type: 'GOAL', amount: 500000, targetScore: '9000' } },
        })
        .expect(200)
    ).body;
    await author
      .patch(`/api/posts/${post.id}`)
      .set('Origin', origin)
      .send({ coaching: { role: 'STUDENT', pricing: { type: 'MONTHLY', amount: 150000 } } })
      .expect(200);
    expect((await author.get(`/api/posts/${post.id}`)).body.post.coaching).toEqual({
      role: 'STUDENT',
      pricing: { type: 'MONTHLY', amount: 150000 },
    });
  });
  it('binds only owned media to a post atomically and respects moderation, blocking, ranges and removal', async () => {
    const image = readFileSync(
      new URL('../../../web/src/features/game-profile/assets/clash-royale-icon.jpg', import.meta.url),
    );
    const peer = supertest.agent(app.getHttpServer());
    const admin = supertest.agent(app.getHttpServer());
    await peer
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-user-0' })
      .expect(200);
    await admin
      .post('/api/auth/test-login')
      .set('Origin', origin)
      .send({ accountId: 'sample-test-admin' })
      .expect(200);
    await supertest(app.getHttpServer())
      .post('/api/post-media')
      .set('Origin', origin)
      .attach('file', image, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(401);
    await author
      .post('/api/post-media')
      .set('Origin', origin)
      .attach('file', image, { filename: 'wrong.png', contentType: 'image/png' })
      .expect(400);
    const media = (
      await author
        .post('/api/post-media')
        .set('Origin', origin)
        .attach('file', image, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(200)
    ).body;
    await author.get(media.url).expect(200);
    await peer.get(media.url).expect(404);
    await supertest(app.getHttpServer()).get(media.url).expect(404);
    const input = {
      categoryId,
      board: 'FREE',
      title: '사진과 동영상이 있는 게시글',
      body: '실제 업로드한 사진을 본문에 삽입하고 다시 조회해서 확인합니다.',
    };
    const document = { ops: [{ insert: input.body }, { insert: { image: media.url } }, { insert: '\n' }] };
    const before = await db.post.count();
    await peer
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, document })
      .expect(400);
    expect(await db.post.count()).toBe(before);
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        ...input,
        document: { ops: [{ insert: input.body }, { insert: { video: media.url } }, { insert: '\n' }] },
      })
      .expect(400);
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        ...input,
        document: {
          ops: [
            { insert: input.body },
            { insert: { video: media.url } },
            { insert: { image: media.url } },
            { insert: '\n' },
          ],
        },
      })
      .expect(400);
    const created = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, document })
        .expect(200)
    ).body;
    await supertest(app.getHttpServer()).get(media.url).expect(200);
    await peer
      .post('/api/reports')
      .set('Origin', origin)
      .send({ targetType: 'POST', targetId: created.id, reason: 'SPAM' })
      .expect(200);
    const reports = (await admin.get('/api/admin/reports').expect(200)).body.items;
    expect(reports.find((row: { targetId: string }) => row.targetId === created.id)).toMatchObject({
      targetPostId: created.id,
      targetPreview: expect.stringContaining(input.body),
    });
    const partial = await peer.get(media.url).set('Range', 'bytes=0-7').expect(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${image.length}`);
    await peer.get(media.url).set('Range', `bytes=${image.length}-`).expect(416);
    await author.delete(media.url).set('Origin', origin).expect(404);
    const userId = created.author.id;
    await peer.post('/api/blocks').set('Origin', origin).send({ blockedUserId: userId }).expect(200);
    await peer.get(media.url).expect(404);
    await peer.delete(`/api/blocks/${userId}`).set('Origin', origin).expect(200);
    await admin
      .post('/api/admin/hide')
      .set('Origin', origin)
      .send({ targetType: 'POST', targetId: created.id, hidden: true, reason: '테스트 신고 검토' })
      .expect(200);
    await supertest(app.getHttpServer()).get(media.url).expect(404);
    await admin
      .post('/api/admin/hide')
      .set('Origin', origin)
      .send({ targetType: 'POST', targetId: created.id, hidden: false, reason: '테스트 복구' })
      .expect(200);
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({ body: input.body, document: { ops: [{ insert: input.body + '\n' }] } })
      .expect(200);
    await author.get(media.url).expect(404);
    expect(await db.postMedia.count({ where: { postId: created.id } })).toBe(0);
    const video = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const uploaded = (
      await author
        .post('/api/post-media')
        .set('Origin', origin)
        .attach('file', video, { filename: 'clip.mp4', contentType: 'video/mp4' })
        .expect(200)
    ).body;
    expect(uploaded.kind).toBe('VIDEO');
    await author
      .patch(`/api/posts/${created.id}`)
      .set('Origin', origin)
      .send({
        body: input.body,
        document: { ops: [{ insert: input.body }, { insert: { video: uploaded.url } }, { insert: '\n' }] },
      })
      .expect(200);
    await author.delete(`/api/posts/${created.id}`).set('Origin', origin).expect(200);
    await author.get(uploaded.url).expect(404);
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
  it('stores battle modes independently, filters both types, and validates recruitment metadata', async () => {
    const input = {
      categoryId,
      board: 'FRIENDLY',
      title: '함께 전투할 플레이어 모집',
      body: '같이 플레이할 분을 찾습니다.',
    };
    const duel = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, battle: { mode: 'DUEL' } })
        .expect(200)
    ).body;
    const team = (
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, battle: { mode: 'TEAM' } })
        .expect(200)
    ).body;
    for (const [mode, own, other] of [
      ['DUEL', duel, team],
      ['TEAM', team, duel],
    ] as const) {
      const result = (
        await author.get('/api/posts').query({ board: 'FRIENDLY', battleMode: mode, limit: 50 }).expect(200)
      ).body;
      expect(result.items).toContainEqual(expect.objectContaining({ id: own.id, battle: { mode } }));
      expect(result.items).not.toContainEqual(expect.objectContaining({ id: other.id }));
    }
    const updated = (
      await author
        .patch(`/api/posts/${team.id}`)
        .set('Origin', origin)
        .send({ battle: { mode: 'DUEL' } })
        .expect(200)
    ).body;
    expect(updated.battle).toEqual({ mode: 'DUEL' });
    expect((await author.get(`/api/posts/${team.id}`).expect(200)).body.post.battle).toEqual({
      mode: 'DUEL',
    });
    for (const battle of [undefined, null, { mode: 'RAID' }, { mode: 1 }, { mode: 'TEAM', extra: true }]) {
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ ...input, battle })
        .expect(400);
    }
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, board: 'FREE', battle: { mode: 'TEAM' } })
      .expect(400);
    await author.patch(`/api/posts/${duel.id}`).set('Origin', origin).send({ battle: null }).expect(400);
    await author.get('/api/posts').query({ board: 'FRIENDLY', battleMode: 'RAID' }).expect(400);
    await author.get('/api/posts').query({ board: 'FREE', battleMode: 'TEAM' }).expect(400);
  });
  it('keeps legacy recruitment posts readable without assigning a battle type', async () => {
    const user = (await author.get('/api/session')).body.user;
    const old = await db.post.create({
      data: {
        categoryId,
        authorId: user.id,
        board: 'FRIENDLY',
        title: '이전 모집 게시글',
        body: '기존 글은 전투 유형을 추측하지 않습니다.',
      },
    });
    expect((await author.get(`/api/posts/${old.id}`).expect(200)).body.post.battle).toBeNull();
    expect(
      (
        await author
          .patch(`/api/posts/${old.id}`)
          .set('Origin', origin)
          .send({ title: '이전 모집 제목 수정' })
          .expect(200)
      ).body.battle,
    ).toBeNull();
    const all = (await author.get('/api/posts').query({ board: 'FRIENDLY', limit: 50 }).expect(200)).body;
    expect(all.items).toContainEqual(expect.objectContaining({ id: old.id, battle: null }));
    const filtered = (
      await author.get('/api/posts').query({ board: 'FRIENDLY', battleMode: 'DUEL', limit: 50 }).expect(200)
    ).body;
    expect(filtered.items).not.toContainEqual(expect.objectContaining({ id: old.id }));
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
        ...(board === 'COACHING'
          ? { coaching: { role: 'STUDENT', pricing: { type: 'HOURLY', amount: null } } }
          : {}),
        ...(board === 'FRIEND_SALE' ? { friendSale: { price: null } } : {}),
        ...(board === 'FRIENDLY' ? { battle: { mode: 'DUEL' } } : {}),
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
  it('filters coaching roles for anonymous readers with search, game and cursor boundaries', async () => {
    const q = `모집유형확인${randomBytes(6).toString('hex')}`;
    const created = [];
    for (const role of ['COACH', 'STUDENT', 'COACH'] as const) {
      const response = await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({
          categoryId,
          board: 'COACHING',
          title: `${q} ${role}`,
          body: '레슨 일정과 조건을 함께 정해요.',
          coaching: { role, pricing: { type: 'HOURLY', amount: 30000 } },
        })
        .expect(200);
      created.push(response.body);
    }
    const reader = supertest(app.getHttpServer());
    for (const role of ['COACH', 'STUDENT'] as const) {
      const result = (
        await reader
          .get('/api/posts')
          .query({
            board: 'COACHING',
            coachingRole: role,
            category: 'clash-royale',
            q,
          })
          .expect(200)
      ).body;
      expect(result.items.map((post: { id: string }) => post.id).sort()).toEqual(
        created
          .filter((post) => post.coaching.role === role)
          .map((post) => post.id)
          .sort(),
      );
    }
    const params = { board: 'COACHING', coachingRole: 'COACH', category: 'clash-royale', q, limit: 1 };
    const first = (await reader.get('/api/posts').query(params).expect(200)).body;
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (
      await reader
        .get('/api/posts')
        .query({ ...params, cursor: first.nextCursor })
        .expect(200)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.nextCursor).toBeNull();
    const otherGame = (
      await reader
        .get('/api/posts')
        .query({ ...params, category: 'another-game' })
        .expect(200)
    ).body;
    expect(otherGame.items).toEqual([]);
    for (const query of [
      { board: 'FREE', coachingRole: 'COACH' },
      { board: 'ALL', coachingRole: 'STUDENT' },
      { board: 'COACHING', coachingRole: 'OTHER' },
    ])
      await reader.get('/api/posts').query(query).expect(400);
  });
  it('filters feedback using visible replies without exposing hidden, deleted or blocked answers', async () => {
    const q = `답변필터${randomBytes(6).toString('hex')}`;
    const reviewer = supertest.agent(app.getHttpServer());
    await reviewer.post('/api/auth/demo').set('Origin', origin).send({ nickname: q }).expect(200);
    const reviewerId = (await reviewer.get('/api/session').expect(200)).body.user.id;
    const records: Array<{ id: string }> = [];
    for (const label of ['waiting', 'answered-one', 'answered-two', 'hidden', 'deleted']) {
      const post = (
        await author
          .post('/api/posts')
          .set('Origin', origin)
          .send({
            categoryId,
            board: 'FEEDBACK',
            title: `${q} ${label}`,
            body: '수비 이후 공격으로 전환하는 타이밍이 궁금합니다.',
          })
          .expect(200)
      ).body;
      records.push({ id: post.id });
      if (label !== 'waiting')
        await db.answer.create({
          data: {
            postId: post.id,
            authorId: reviewerId,
            body: '상대의 카드 순환을 확인한 뒤 공격해보세요.',
            hidden: label === 'hidden',
            deletedAt: label === 'deleted' ? new Date() : null,
          },
        });
    }
    const ids = (names: number[]) => names.map((index) => records[index]?.id).sort();
    const params = { board: 'FEEDBACK', category: 'clash-royale', q };
    const reader = supertest(app.getHttpServer());
    for (const [feedbackStatus, expected] of [
      ['WAITING', [0, 3, 4]],
      ['ANSWERED', [1, 2]],
    ] as const) {
      const result = (
        await reader
          .get('/api/posts')
          .query({ ...params, feedbackStatus })
          .expect(200)
      ).body;
      expect(result.items.map((post: { id: string }) => post.id).sort()).toEqual(ids([...expected]));
      expect(
        result.items.every((post: { answerCount: number }) =>
          feedbackStatus === 'WAITING' ? post.answerCount === 0 : post.answerCount > 0,
        ),
      ).toBe(true);
    }
    const first = (
      await reader
        .get('/api/posts')
        .query({ ...params, feedbackStatus: 'ANSWERED', limit: 1 })
        .expect(200)
    ).body;
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (
      await reader
        .get('/api/posts')
        .query({ ...params, feedbackStatus: 'ANSWERED', limit: 1, cursor: first.nextCursor })
        .expect(200)
    ).body;
    expect([first.items[0].id, second.items[0].id].sort()).toEqual(ids([1, 2]));
    expect(second.nextCursor).toBeNull();
    expect(
      (
        await reader
          .get('/api/posts')
          .query({ ...params, feedbackStatus: 'ANSWERED', category: 'another-game' })
          .expect(200)
      ).body.items,
    ).toEqual([]);
    await author.post('/api/blocks').set('Origin', origin).send({ blockedUserId: reviewerId }).expect(200);
    try {
      expect(
        (
          await author
            .get('/api/posts')
            .query({ ...params, feedbackStatus: 'ANSWERED' })
            .expect(200)
        ).body.items,
      ).toEqual([]);
      const waiting = (
        await author
          .get('/api/posts')
          .query({ ...params, feedbackStatus: 'WAITING' })
          .expect(200)
      ).body;
      expect(waiting.items.map((post: { id: string }) => post.id).sort()).toEqual(ids([0, 1, 2, 3, 4]));
      expect(
        (
          await reader
            .get('/api/posts')
            .query({ ...params, feedbackStatus: 'ANSWERED' })
            .expect(200)
        ).body.items,
      ).toHaveLength(2);
    } finally {
      await author.delete(`/api/blocks/${reviewerId}`).set('Origin', origin).expect(200);
    }
    for (const query of [
      { board: 'FREE', feedbackStatus: 'WAITING' },
      { board: 'ALL', feedbackStatus: 'ANSWERED' },
      { feedbackStatus: 'WAITING' },
      { board: 'FEEDBACK', feedbackStatus: 'UNKNOWN' },
      { board: 'FEEDBACK', feedbackStatus: 'ANSWERED', unanswered: 'true' },
    ])
      await reader.get('/api/posts').query(query).expect(400);
    const legacy = (
      await reader
        .get('/api/posts')
        .query({ ...params, unanswered: 'true' })
        .expect(200)
    ).body;
    expect(legacy.items.map((post: { id: string }) => post.id).sort()).toEqual(ids([0, 3, 4]));
  });
});
