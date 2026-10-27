import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AnswerPageSchema,
  PostDetailSchema,
  PostListSchema,
  PostSchema,
  SessionSchema,
  type Answer,
} from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';
import { ANSWER_PAGE } from './answer-page';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type Agent = ReturnType<typeof supertest.agent>;

describe('post answers paged like comments with deployed migrations', () => {
  const state = {} as {
    app: INestApplication;
    db: PrismaClient;
    schema: string;
    categoryId: string;
  };

  async function login(nickname: string) {
    const agent = supertest.agent(state.app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    const session = SessionSchema.parse(response.body);
    if (!session.user) throw new Error('Expected authenticated fixture');
    return { agent, id: session.user.id };
  }
  async function createPost(agent: Agent) {
    const response = await agent
      .post('/api/posts')
      .set('Origin', origin)
      .send({ categoryId: state.categoryId, title: '답변 페이지 테스트', body: '피드백을 많이 남겨주세요.' })
      .expect(200);
    return PostSchema.parse(response.body);
  }
  async function detail(agent: Agent, postId: string) {
    return PostDetailSchema.parse((await agent.get(`/api/posts/${postId}`).expect(200)).body);
  }
  /** 상세 뒤의 답변을 작은 페이지로 끝까지 받는다. */
  async function rest(agent: Agent, postId: string, cursor: string | null): Promise<Answer[]> {
    if (!cursor) return [];
    const page = AnswerPageSchema.parse(
      (await agent.get(`/api/posts/${postId}/answers`).query({ cursor, limit: 2 }).expect(200)).body,
    );
    return [...page.items, ...(await rest(agent, postId, page.nextCursor))];
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    state.schema = `gf_test_answer_page_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', state.schema);
    const databaseUrl = url.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`Answer migration deployment failed: ${result.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(state.db, false);
    state.app = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: true,
      rateLimit: false,
      prisma: state.db,
    });
    state.categoryId = (await state.db.category.findFirstOrThrow({ where: { active: true } })).id;
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_answer_page_[a-f0-9]{16}$/.test(state.schema)) throw new Error('Unowned answer schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('returns the first answers in the detail, counts every visible answer and pages the rest in order', async () => {
    const author = await login('답변페이지작성자');
    const helper = await login('답변페이지도우미');
    const blocked = await login('답변페이지차단대상');
    const viewer = await login('답변페이지열람자');
    const post = await createPost(author.agent);
    const start = Date.now() - 3_600_000;
    const total = ANSWER_PAGE + 4;
    await state.db.answer.createMany({
      data: Array.from({ length: total }, (_, index) => ({
        id: `answer-${String(index).padStart(3, '0')}-${post.id}`,
        postId: post.id,
        authorId: index === 5 ? blocked.id : helper.id,
        body: `답변 ${index}`,
        // 늦게 달린 두 답변이 도움됨이라 맨 앞에 와야 한다.
        helpful: index === total - 1 || index === total - 2,
        hidden: index === 7,
        createdAt: new Date(start + index * 1000),
      })),
    });
    const visible = Array.from({ length: total }, (_, index) => index).filter((index) => index !== 7);
    const expectedOrder = [total - 2, total - 1, ...visible.filter((index) => index < total - 2)].map(
      (index) => `answer-${String(index).padStart(3, '0')}-${post.id}`,
    );

    const first = await detail(author.agent, post.id);
    expect(first.answers).toHaveLength(ANSWER_PAGE);
    expect(first.post).toMatchObject({ answerCount: visible.length, helpfulCount: 2 });
    expect(first.answersCursor).toEqual(expect.any(String));
    const all = [...first.answers, ...(await rest(author.agent, post.id, first.answersCursor))];
    expect(all.map(({ id }) => id)).toEqual(expectedOrder);
    const listed = PostListSchema.parse(
      (await author.agent.get('/api/posts').query({ authorId: author.id }).expect(200)).body,
    );
    expect(listed.items.find(({ id }) => id === post.id)).toMatchObject({
      answerCount: visible.length,
      helpfulCount: 2,
    });

    // 차단한 작성자의 답변은 상세·이어 받기·개수 모두에서 빠진다.
    await viewer.agent
      .post('/api/blocks')
      .set('Origin', origin)
      .send({ blockedUserId: blocked.id })
      .expect(200);
    const filtered = await detail(viewer.agent, post.id);
    const filteredAll = [...filtered.answers, ...(await rest(viewer.agent, post.id, filtered.answersCursor))];
    expect(filtered.post.answerCount).toBe(visible.length - 1);
    expect(filteredAll.map(({ id }) => id)).toEqual(
      expectedOrder.filter((id) => !id.startsWith('answer-005-')),
    );
  });

  it('rejects broken cursors, hides answers of an invisible post and has no cursor for short threads', async () => {
    const author = await login('답변커서작성자');
    const post = await createPost(author.agent);
    const short = await detail(author.agent, post.id);
    expect(short).toMatchObject({ answers: [], answersCursor: null, post: { answerCount: 0 } });
    const broken = await author.agent.get(`/api/posts/${post.id}/answers`).query({ cursor: 'broken' });
    expect(broken.status).toBe(400);
    expect(broken.body.errorCode).toBe('INVALID_CURSOR');
    await state.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    await author.agent.get(`/api/posts/${post.id}/answers`).expect(404);
  });
});
