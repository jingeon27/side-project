import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupportThreadListSchema, SupportThreadSchema, type TSupportThread } from '@game-feedback/contracts';

import { createApp } from '../../app';
import { assertDatabaseUrl } from '../../database/database-url';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { createAdminAccount } from '../auth/admin-account';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const password = 'isolated-admin-password';

describe('administrator support inbox pages, status filter and direct thread', () => {
  const state = {} as {
    app: INestApplication;
    db: PrismaClient;
    schema: string;
    cookie: string;
    otherCookie: string;
    threads: Array<{ id: string; status: string }>;
    foreignThreadId: string;
  };
  const request = () => supertest(state.app.getHttpServer());
  async function login(username: string) {
    const response = await request()
      .post('/api/admin/auth/login')
      .set('Origin', origin)
      .send({ username, password })
      .expect(200);
    const cookie = String(response.headers['set-cookie']).split(';')[0];
    if (!cookie) throw new Error('Admin cookie missing');
    return cookie;
  }
  async function thread(adminId: string, index: number, status: 'OPEN' | 'CLOSED') {
    const requester = await state.db.user.create({
      data: { nickname: `문의자${index}`, termsVersion: 'test', ageConfirmed: true },
    });
    const [firstUserId, secondUserId] = [requester.id, adminId].sort();
    const conversation = await state.db.chatConversation.create({
      data: {
        firstUserId: firstUserId ?? '',
        secondUserId: secondUserId ?? '',
        // 대화가 늦게 갱신된 문의일수록 목록 위에 와야 한다.
        updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)),
      },
    });
    return state.db.supportConversation.create({
      data: { requesterId: requester.id, adminId, conversationId: conversation.id, topic: 'GENERAL', status },
      select: { id: true, status: true },
    });
  }
  async function list(query: Record<string, string | number>, cookie = state.cookie) {
    const response = await request().get('/api/admin/support').query(query).set('Cookie', cookie).expect(200);
    return SupportThreadListSchema.parse(response.body);
  }
  async function all(query: Record<string, string | number>): Promise<TSupportThread[]> {
    const page = await list(query);
    return page.nextCursor
      ? [...page.items, ...(await all({ ...query, cursor: page.nextCursor }))]
      : page.items;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    state.schema = `gf_test_admin_support_${randomBytes(8).toString('hex')}`;
    url.searchParams.set('schema', state.schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migrated = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migrated.status !== 0) throw new Error(`Isolated support migration failed: ${migrated.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    state.app = await createApp({
      databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      demoMode: false,
      testAuthEnabled: false,
      rateLimit: false,
    });
    const admin = await createAdminAccount(state.db, 'support-operator', password);
    const other = await createAdminAccount(state.db, 'other-operator', password);
    state.threads = [];
    for (const index of Array.from({ length: 105 }, (_, offset) => offset))
      state.threads.push(await thread(admin.userId, index, index % 3 === 0 ? 'CLOSED' : 'OPEN'));
    state.foreignThreadId = (await thread(other.userId, 200, 'OPEN')).id;
    state.cookie = await login('support-operator');
    state.otherCookie = await login('other-operator');
  }, 60000);
  afterAll(async () => {
    await state.app?.close();
    if (!state.db) return;
    if (!/^gf_test_admin_support_[a-f0-9]{16}$/.test(state.schema)) throw new Error('Unowned support schema');
    await state.db.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
    await state.db.$disconnect();
  });

  it('pages every assigned thread beyond the former 100-row cut by latest conversation', async () => {
    const first = await list({ limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    const threads = await all({ limit: 50 });
    const newestFirst = [...state.threads].reverse().map(({ id }) => id);
    expect(threads.map(({ id }) => id)).toEqual(newestFirst);
    expect(threads.map(({ id }) => id)).not.toContain(state.foreignThreadId);
  });

  it('filters by status and rejects unknown statuses and broken cursors', async () => {
    const closed = await all({ status: 'CLOSED', limit: 7 });
    expect(closed.map(({ id }) => id)).toEqual(
      [...state.threads]
        .reverse()
        .filter(({ status }) => status === 'CLOSED')
        .map(({ id }) => id),
    );
    expect(closed.every(({ status }) => status === 'CLOSED')).toBe(true);
    expect((await all({ status: 'OPEN', limit: 50 })).every(({ status }) => status === 'OPEN')).toBe(true);
    await request()
      .get('/api/admin/support')
      .query({ status: 'PENDING' })
      .set('Cookie', state.cookie)
      .expect(400);
    await request()
      .get('/api/admin/support')
      .query({ cursor: 'broken' })
      .set('Cookie', state.cookie)
      .expect(400);
  });

  it('opens a thread by id for deep links and hides other administrators’ threads', async () => {
    const oldest = state.threads[0];
    if (!oldest) throw new Error('Expected support fixtures');
    const response = await request()
      .get(`/api/admin/support/${oldest.id}`)
      .set('Cookie', state.cookie)
      .expect(200);
    expect(SupportThreadSchema.parse(response.body)).toMatchObject({ id: oldest.id, status: oldest.status });
    const hidden = await request()
      .get(`/api/admin/support/${state.foreignThreadId}`)
      .set('Cookie', state.cookie)
      .expect(404);
    expect(hidden.body.errorCode).toBe('SUPPORT_NOT_FOUND');
    await request()
      .get(`/api/admin/support/${state.foreignThreadId}`)
      .set('Cookie', state.otherCookie)
      .expect(200);
    await request().get(`/api/admin/support/${oldest.id}`).expect(401);
  });
});
