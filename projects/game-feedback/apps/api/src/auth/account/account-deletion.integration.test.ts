import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommentSchema, PostDetailSchema, PostSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../../app';
import { assertDatabaseUrl } from '../../database/database-url';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { seed } from '../../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type TAgent = ReturnType<typeof supertest.agent>;

describe('account deletion keeps other users’ replies unchanged', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let schema: string;

  async function login(nickname: string) {
    const agent = supertest.agent(app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    if (!SessionSchema.parse(response.body).user) throw new Error('Expected a demo user.');
    return agent;
  }
  async function comment(agent: TAgent, postId: string, body: string, parentId?: string) {
    const response = await agent
      .post(`/api/posts/${postId}/comments`)
      .set('Origin', origin)
      .send({ body, ...(parentId ? { parentId } : {}) })
      .expect(200);
    return CommentSchema.parse(response.body);
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    schema = `gf_test_account_deletion_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(`Migration deployment failed: ${result.stderr}\n${result.stdout}`);
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(db, false);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_account_deletion_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema.');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('detaches replies from the withdrawn comment without marking them as edited', async () => {
    const author = await login('탈퇴테스트글쓴이');
    const withdrawing = await login('탈퇴테스트원댓글');
    const replier = await login('탈퇴테스트답글');
    const category = await db.category.findFirstOrThrow({ where: { active: true } });
    const post = PostSchema.parse(
      (
        await author
          .post('/api/posts')
          .set('Origin', origin)
          .send({ categoryId: category.id, board: 'FREE', title: '탈퇴 답글 보존', body: '답글 보존 확인' })
          .expect(200)
      ).body,
    );
    const root = await comment(withdrawing, post.id, '곧 탈퇴할 사람의 댓글');
    const reply = await comment(replier, post.id, '남아야 하는 답글', root.id);
    const before = await db.comment.findUniqueOrThrow({ where: { id: reply.id } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await withdrawing.delete('/api/me').set('Origin', origin).expect(200);

    const after = await db.comment.findUniqueOrThrow({ where: { id: reply.id } });
    expect(after.parentId).toBeNull();
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    const detail = PostDetailSchema.parse((await author.get(`/api/posts/${post.id}`).expect(200)).body);
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0]).toMatchObject({ id: reply.id, parentId: null, isDeleted: false });
    expect(detail.comments[0]?.updatedAt).toBe(reply.updatedAt);
  });
});
