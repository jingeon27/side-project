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
    for (const board of ['ACCOUNT_TRADE', 'FRIENDLY', 'FRIEND', 'SALE']) {
      const document = { ops: [{ insert: body, attributes: { bold: true } }, { insert: '\n' }] };
      const created = (
        await author
          .post('/api/posts')
          .set('Origin', origin)
          .send({ categoryId, board, title: `${board} 모집 게시글`, body, document })
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
    await author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ ...input, board: 'UNKNOWN' })
      .expect(400);
    await author.get('/api/posts?board=UNKNOWN').expect(400);
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
});
