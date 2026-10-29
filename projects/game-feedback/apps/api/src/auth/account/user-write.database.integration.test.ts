import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminAccount } from '../../admin/auth/admin-account';
import { createApp } from '../../app';
import { assertDatabaseUrl } from '../../database/database-url';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { hash, token } from '../../security';
import { seed } from '../../seed';

class TestGate {
  resolve: () => void = () => undefined;
  readonly promise = new Promise<void>((resolve) => {
    this.resolve = resolve;
  });
}

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_banned_write_${randomBytes(8).toString('hex')}`;
const state: { db?: PrismaClient; app?: INestApplication } = {};
const postInput = { categoryId: 'clash-royale', board: 'FREE', title: '허용되면 안 되는 글', body: '본문' };

function fixture() {
  if (!state.db || !state.app) throw new Error('Expected an isolated banned-write fixture.');
  return { db: state.db, app: state.app };
}

async function actor(banned = false) {
  const { db, app } = fixture();
  const user = await db.user.create({
    data: {
      nickname: '제재 경합 사용자',
      termsVersion: 'test',
      ageConfirmed: true,
      bannedAt: banned ? new Date() : null,
    },
  });
  const raw = token();
  await db.session.create({
    data: { userId: user.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 60_000) },
  });
  return { id: user.id, http: supertest.agent(app.getHttpServer()).set('Authorization', `Bearer ${raw}`) };
}

describe('제재 확정 뒤 사용자 쓰기 잠금 재검사', () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0) throw new Error(`Banned-write migration failed: ${migration.stderr}`);
    const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    state.db = db;
    await seed(db, false);
    state.app = await createApp({ databaseUrl, prisma: db, webOrigin: origin, rateLimit: false });
    await createAdminAccount(db, 'banned-write-admin', 'isolated-admin-password');
  }, 30_000);

  afterAll(async () => {
    await state.app?.close();
    if (!state.db) return;
    if (!/^gf_test_banned_write_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned banned-write schema.');
    await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await state.db.$disconnect();
  });

  it.each(['post', 'comment'] as const)(
    '세션이 제재 전 상태를 읽어도 잠금 대기 뒤 새 %s를 저장하지 않아야 한다',
    async (kind) => {
      const { db } = fixture();
      const user = await actor();
      const peer = await actor();
      const post = await db.post.create({ data: { ...postInput, authorId: peer.id } });
      const locked = new TestGate();
      const release = new TestGate();
      const blocker = { pid: 0 };
      const banning = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
          await tx.user.update({ where: { id: user.id }, data: { bannedAt: new Date() } });
          const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
          blocker.pid = row?.pid ?? 0;
          locked.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      await locked.promise;
      const request =
        kind === 'post'
          ? user.http.post('/api/posts').send(postInput)
          : user.http.post(`/api/posts/${post.id}/comments`).send({ body: '제재 뒤 저장되면 안 되는 댓글' });
      const writing = Promise.resolve(request.set('Origin', origin));
      try {
        // HTTP 세션 조회는 MVCC의 제재 전 상태를 통과하고 실제 사용자 행 잠금에서 기다린다.
        await expect
          .poll(
            () => db.$queryRaw<Array<{ pid: number }>>`
          SELECT pid FROM pg_stat_activity WHERE ${blocker.pid} = ANY(pg_blocking_pids(pid))
        `,
            { interval: 10, timeout: 2500 },
          )
          .not.toHaveLength(0);
        release.resolve();
        await banning;
        expect(await writing).toMatchObject({ status: 403, body: { errorCode: 'USER_BANNED' } });
      } finally {
        release.resolve();
        await Promise.allSettled([banning, writing]);
      }
      expect(await db.post.count({ where: { authorId: user.id } })).toBe(0);
      expect(await db.comment.count({ where: { authorId: user.id } })).toBe(0);
    },
  );

  it('제재된 사용자도 관리자 문의와 문의 첨부 업로드 예약을 계속 이용할 수 있어야 한다', async () => {
    const user = await actor(true);
    const thread = await user.http
      .post('/api/support/conversations')
      .set('Origin', origin)
      .send({ topic: 'GENERAL' })
      .expect(200);
    await user.http
      .post(`/api/conversations/${thread.body.id}/messages`)
      .set('Origin', origin)
      .send({ body: '제재에 대해 문의합니다.', clientMessageId: randomUUID() })
      .expect(200);
    await user.http
      .post(`/api/conversations/${thread.body.id}/attachments/uploads`)
      .set('Origin', origin)
      .send({ name: 'evidence.png', mimeType: 'image/png', size: 12 })
      .expect(200);
    await user.http.post('/api/posts').set('Origin', origin).send(postInput).expect(403);
  });
});
