import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostListSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_search_${randomBytes(8).toString('hex')}`;
interface IState {
  app: INestApplication;
  db: PrismaClient;
}

describe('post search indexes', () => {
  const state = {} as IState;
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`Isolated migration failed: ${result.stdout}\n${result.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(state.db, false);
    state.app = await createApp({
      databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      demoMode: true,
      rateLimit: false,
    });
  }, 30_000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_search_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('creates trigram indexes that serve case-insensitive title and body search', async () => {
    const author = supertest.agent(state.app.getHttpServer());
    await author.post('/api/auth/demo').set('Origin', origin).send({ nickname: '검색작성자' }).expect(200);
    const categoryId = (await state.db.category.findFirstOrThrow({ where: { active: true } })).id;
    for (const [title, body] of [
      ['Hog Rider 수비 질문', '본문입니다.'],
      ['다른 질문', '골렘 덱에서 hog rider를 막는 방법'],
      ['관계없는 글', '내용 없음'],
    ])
      await author
        .post('/api/posts')
        .set('Origin', origin)
        .send({ categoryId, board: 'FREE', title, body })
        .expect(200);
    const found = PostListSchema.parse(
      (
        await supertest(state.app.getHttpServer())
          .get('/api/posts')
          .query({ board: 'FREE', q: 'HOG RIDER' })
          .expect(200)
      ).body,
    );
    expect(found.items.map((post) => post.title).sort()).toEqual(['Hog Rider 수비 질문', '다른 질문'].sort());
    const indexes = await state.db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = ${schema} AND indexname LIKE 'Post_%_trgm_idx'
    `;
    expect(indexes.map(({ indexname }) => indexname).sort()).toEqual([
      'Post_body_trgm_idx',
      'Post_title_trgm_idx',
    ]);
    const plan = await state.db.$transaction(async (tx) => {
      // 표가 작아도 조건을 받는 인덱스가 있는지만 본다. 순차·전체 인덱스 스캔을 끄면 비트맵 인덱스 스캔만 남는다.
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      await tx.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
      await tx.$executeRawUnsafe('SET LOCAL enable_indexonlyscan = off');
      return tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN SELECT "id" FROM "${schema}"."Post" WHERE "title" ILIKE '%hog rider%'`,
      );
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('Post_title_trgm_idx');
  });
});
