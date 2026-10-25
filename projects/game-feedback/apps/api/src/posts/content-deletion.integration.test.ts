import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AnswerSchema, CommentSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_deletion_${randomBytes(8).toString('hex')}`;
type TAgent = ReturnType<typeof supertest.agent>;
interface IState {
  app: INestApplication;
  db: PrismaClient;
  categoryId: string;
  author: TAgent;
  other: TAgent;
}

describe('author deletion of moderated content', () => {
  const state = {} as IState;
  async function login(nickname: string) {
    const agent = supertest.agent(state.app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    if (!SessionSchema.parse(response.body).user) throw new Error('Expected authenticated fixture');
    return agent;
  }
  async function post(agent: TAgent, body: Record<string, unknown>) {
    const response = await agent
      .post('/api/posts')
      .set('Origin', origin)
      .send({ categoryId: state.categoryId, title: '숨김 삭제 확인', body: '본문입니다.', ...body })
      .expect(200);
    return PostSchema.parse(response.body);
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
    state.author = await login('숨김삭제작성자');
    state.other = await login('숨김삭제외부인');
    state.categoryId = (await state.db.category.findFirstOrThrow({ where: { active: true } })).id;
  }, 30_000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_deletion_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
  });

  it('lets authors delete their hidden posts and clears recruitment metadata', async () => {
    const recruit = await post(state.author, { board: 'FRIENDLY', battle: { mode: 'DUEL' } });
    await state.db.post.update({ where: { id: recruit.id }, data: { hidden: true } });
    await state.other.delete(`/api/posts/${recruit.id}`).set('Origin', origin).expect(404);
    await state.author.delete(`/api/posts/${recruit.id}`).set('Origin', origin).expect(200);
    const stored = await state.db.post.findUniqueOrThrow({ where: { id: recruit.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.battle).toBeNull();
    expect(stored.body).toBe('');
    await state.author.delete(`/api/posts/${recruit.id}`).set('Origin', origin).expect(404);
    const visible = await post(state.author, { board: 'FREE' });
    await state.other.delete(`/api/posts/${visible.id}`).set('Origin', origin).expect(403);
    await state.other.delete('/api/posts/a.b').set('Origin', origin).expect(404);
  });

  it('lets authors delete their hidden answers and comments without revealing others', async () => {
    const feedback = await post(state.other, { board: 'FEEDBACK' });
    const answer = AnswerSchema.parse(
      (
        await state.author
          .post(`/api/posts/${feedback.id}/answers`)
          .set('Origin', origin)
          .send({ body: '첫 공격을 받아낸 뒤 반격해보세요.' })
          .expect(200)
      ).body,
    );
    const comment = CommentSchema.parse(
      (
        await state.author
          .post(`/api/posts/${feedback.id}/comments`)
          .set('Origin', origin)
          .send({ body: '숨겨질 댓글' })
          .expect(200)
      ).body,
    );
    await state.other.delete(`/api/answers/${answer.id}`).set('Origin', origin).expect(403);
    await state.other.delete(`/api/comments/${comment.id}`).set('Origin', origin).expect(403);
    await state.db.answer.update({ where: { id: answer.id }, data: { hidden: true } });
    await state.db.comment.update({ where: { id: comment.id }, data: { hidden: true } });
    await state.other.delete(`/api/answers/${answer.id}`).set('Origin', origin).expect(404);
    await state.other.delete(`/api/comments/${comment.id}`).set('Origin', origin).expect(404);
    await state.author.delete(`/api/answers/${answer.id}`).set('Origin', origin).expect(200);
    await state.author.delete(`/api/comments/${comment.id}`).set('Origin', origin).expect(200);
    expect(await state.db.answer.findUniqueOrThrow({ where: { id: answer.id } })).toMatchObject({ body: '' });
    expect(await state.db.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({
      body: '',
    });
    expect(await state.db.notification.count({ where: { postId: feedback.id } })).toBe(0);
    await state.author.delete(`/api/answers/${answer.id}`).set('Origin', origin).expect(404);
    await state.author.delete(`/api/comments/${comment.id}`).set('Origin', origin).expect(404);
  });
});
