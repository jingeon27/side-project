import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { postCacheTag, PostSchema, PostViewSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';
import { ANONYMOUS_VIEWS_PER_NETWORK } from './post-views.service';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_views_${randomBytes(8).toString('hex')}`;
interface IState {
  app: INestApplication;
  db: PrismaClient;
  author: ReturnType<typeof supertest.agent>;
  categoryId: string;
}

describe('post view counting', () => {
  const state = {} as IState;
  async function post() {
    const response = await state.author
      .post('/api/posts')
      .set('Origin', origin)
      .send({ categoryId: state.categoryId, board: 'FREE', title: '조회수 확인', body: '본문입니다.' })
      .expect(200);
    return PostSchema.parse(response.body);
  }
  async function view(id: string, userAgent: string, visitorId = randomUUID()) {
    const response = await supertest(state.app.getHttpServer())
      .post(`/api/posts/${id}/views`)
      .set('Origin', origin)
      .set('User-Agent', userAgent)
      .send({ visitorId })
      .expect(200);
    return PostViewSchema.parse(response.body).viewCount;
  }

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
    state.author = supertest.agent(state.app.getHttpServer());
    await state.author
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send({ nickname: '조회수작성자' })
      .expect(200);
    state.categoryId = (await state.db.category.findFirstOrThrow({ where: { active: true } })).id;
  }, 30_000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_views_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('records views without invalidating the public post cache document', async () => {
    const created = await post();
    await state.db.cacheInvalidation.deleteMany();
    expect(await view(created.id, 'view-cache-agent')).toBe(1);
    expect(await view(created.id, 'view-cache-agent')).toBe(2);
    expect(
      await state.db.cacheInvalidation.findUnique({ where: { tag: postCacheTag(created.id) } }),
    ).toBeNull();
    expect(await state.db.cacheInvalidation.count()).toBe(0);
  });

  it('limits anonymous visitor ids from one IP and user agent but counts other agents and members', async () => {
    const created = await post();
    for (let index = 1; index <= ANONYMOUS_VIEWS_PER_NETWORK; index += 1)
      expect(await view(created.id, 'same-browser')).toBe(index);
    expect(await view(created.id, 'same-browser')).toBe(ANONYMOUS_VIEWS_PER_NETWORK);
    expect(await view(created.id, 'another-browser')).toBe(ANONYMOUS_VIEWS_PER_NETWORK + 1);
    const member = await state.author
      .post(`/api/posts/${created.id}/views`)
      .set('Origin', origin)
      .set('User-Agent', 'same-browser')
      .send({ visitorId: randomUUID() })
      .expect(200);
    expect(PostViewSchema.parse(member.body).viewCount).toBe(ANONYMOUS_VIEWS_PER_NETWORK + 2);
    expect(await state.db.postView.count({ where: { postId: created.id, networkHash: { not: null } } })).toBe(
      ANONYMOUS_VIEWS_PER_NETWORK + 1,
    );
    await state.db.postView.updateMany({
      where: { postId: created.id },
      data: { lastViewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    expect(await view(created.id, 'same-browser')).toBe(ANONYMOUS_VIEWS_PER_NETWORK + 3);
  });
});
