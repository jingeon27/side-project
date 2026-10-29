import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AnswerSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_answers_${randomBytes(8).toString('hex')}`;
type TAgent = ReturnType<typeof supertest.agent>;
interface IState {
  app: INestApplication;
  db: PrismaClient;
  categoryId: string;
  requester: { agent: TAgent; id: string };
  reviewer: { agent: TAgent; id: string };
}

describe('answer regressions with deployed migrations', () => {
  const state = {} as IState;
  async function login(nickname: string) {
    const agent = supertest.agent(state.app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    const session = SessionSchema.parse(response.body);
    if (!session.user) throw new Error('Expected authenticated fixture');
    return { agent, id: session.user.id };
  }
  async function feedbackPost() {
    const response = await state.requester.agent
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        categoryId: state.categoryId,
        board: 'FEEDBACK',
        title: '도움됨 알림 확인',
        body: '이 덱으로 어떻게 운영하면 좋을까요?',
      })
      .expect(200);
    return PostSchema.parse(response.body);
  }
  async function answer(postId: string) {
    const response = await state.reviewer.agent
      .post(`/api/posts/${postId}/answers`)
      .set('Origin', origin)
      .send({ body: '엘릭서를 아껴서 역공을 준비해보세요.' })
      .expect(200);
    return AnswerSchema.parse(response.body);
  }
  function markHelpful(answerId: string, helpful: boolean) {
    return state.requester.agent
      .post(`/api/answers/${answerId}/helpful`)
      .set('Origin', origin)
      .send({ helpful })
      .expect(200);
  }
  function helpfulNotifications(answerId: string) {
    return state.db.notification.count({ where: { answerId, type: 'HELPFUL' } });
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
    state.requester = await login('답변회귀요청자');
    state.reviewer = await login('답변회귀작성자');
    state.categoryId = (await state.db.category.findFirstOrThrow({ where: { active: true } })).id;
  }, 30_000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_answers_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('keeps at most one helpful notification while the requester toggles or the reviewer edits', async () => {
    const post = await feedbackPost();
    const created = await answer(post.id);
    await markHelpful(created.id, true);
    expect(await helpfulNotifications(created.id)).toBe(1);
    await markHelpful(created.id, true);
    expect(await helpfulNotifications(created.id)).toBe(1);
    await markHelpful(created.id, false);
    expect(await helpfulNotifications(created.id)).toBe(0);
    await markHelpful(created.id, true);
    await markHelpful(created.id, false);
    await markHelpful(created.id, true);
    expect(await helpfulNotifications(created.id)).toBe(1);
    const edited = await state.reviewer.agent
      .patch(`/api/answers/${created.id}`)
      .set('Origin', origin)
      .send({ body: '첫 공격을 받아낸 뒤 반대쪽으로 압박해보세요.' })
      .expect(200);
    expect(AnswerSchema.parse(edited.body).helpful).toBe(false);
    expect(await helpfulNotifications(created.id)).toBe(0);
    expect(await state.db.notification.count({ where: { answerId: created.id, type: 'ANSWER' } })).toBe(1);
  });

  it('rechecks post visibility inside the write transaction for answers and helpful marks', async () => {
    const post = await feedbackPost();
    const created = await answer(post.id);
    await state.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    await state.reviewer.agent
      .post(`/api/posts/${post.id}/answers`)
      .set('Origin', origin)
      .send({ body: '숨겨진 글에는 답변이 붙지 않아야 합니다.' })
      .expect(404);
    await state.reviewer.agent
      .patch(`/api/answers/${created.id}`)
      .set('Origin', origin)
      .send({ body: '숨겨진 글의 답변은 고칠 수 없어야 합니다.' })
      .expect(404);
    await state.requester.agent
      .post(`/api/answers/${created.id}/helpful`)
      .set('Origin', origin)
      .send({ helpful: true })
      .expect(404);
    await state.reviewer.agent
      .post('/api/posts/a.b/answers')
      .set('Origin', origin)
      .send({ body: '형식이 틀린 글에는 답변할 수 없어야 합니다.' })
      .expect(404);
    expect(await state.db.answer.count({ where: { postId: post.id } })).toBe(1);
  });
});
