import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminReportListSchema } from '@game-feedback/contracts';

import { createApp } from '../../app';
import { assertDatabaseUrl } from '../../database/database-url';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { seed } from '../../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type TAgent = ReturnType<typeof supertest.agent>;

describe('administrator report queue by status and cursor', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let schema: string;
  let admin: TAgent;
  let reporter: TAgent;
  const openIds: string[] = [];

  async function list(agent: TAgent, query: Record<string, string | number> = {}) {
    return AdminReportListSchema.parse((await agent.get('/api/admin/reports').query(query).expect(200)).body);
  }
  async function login(accountId: string) {
    const agent = supertest.agent(app.getHttpServer());
    await agent.post('/api/auth/test-token').set('Origin', origin).send({ accountId }).expect(200);
    return agent;
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    schema = `gf_test_admin_reports_${randomBytes(8).toString('hex')}`;
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
    await seed(db, true);
    app = await createApp({
      databaseUrl,
      webOrigin: origin,
      testAuthEnabled: true,
      rateLimit: false,
      prisma: db,
    });
    admin = await login('sample-test-admin');
    reporter = await login('sample-user-0');
    const base = Date.parse('2026-10-01T00:00:00.000Z');
    // Two rows share a timestamp so the id tie-break decides the order across a page boundary.
    const rows = Array.from({ length: 18 }, (_, index) => ({
      reporterId: 'sample-user-0',
      targetType: 'USER',
      targetId: `queue-target-${index}`,
      reason: 'SPAM',
      status: index < 15 ? 'OPEN' : index < 17 ? 'REVIEWED' : 'DISMISSED',
      createdAt: new Date(base + Math.min(index, 13) * 60_000),
    }));
    await db.report.createMany({ data: rows });
    const open = await db.report.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    openIds.push(...open.map(({ id }) => id));
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_admin_reports_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema.');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('lists open reports first and walks every page without gaps or repeats', async () => {
    const first = await list(admin);
    expect(first.items).toHaveLength(12);
    expect(first.items.every((item) => item.status === 'OPEN')).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(admin, { cursor: first.nextCursor ?? '' });
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map(({ id }) => id)).toEqual(openIds);
  });

  it('filters by the requested status with its own cursor', async () => {
    expect((await list(admin, { status: 'REVIEWED' })).items.map(({ targetId }) => targetId).sort()).toEqual([
      'queue-target-15',
      'queue-target-16',
    ]);
    const dismissed = await list(admin, { status: 'DISMISSED', limit: 1 });
    expect(dismissed.items.map(({ targetId }) => targetId)).toEqual(['queue-target-17']);
    expect(dismissed.nextCursor).toBeNull();
    const page = await list(admin, { status: 'OPEN', limit: 5 });
    expect(page.items.map(({ id }) => id)).toEqual(openIds.slice(0, 5));
  });

  it('moves a reviewed report out of the open queue', async () => {
    const [latest] = openIds;
    await admin
      .patch(`/api/admin/reports/${latest}`)
      .set('Origin', origin)
      .send({ status: 'REVIEWED' })
      .expect(200);
    expect((await list(admin, { limit: 50 })).items.map(({ id }) => id)).toEqual(openIds.slice(1));
    expect((await list(admin, { status: 'REVIEWED', limit: 50 })).items.map(({ id }) => id)).toContain(
      latest,
    );
  });

  it('rejects invalid queries and non-administrators', async () => {
    for (const query of [{ status: 'CLOSED' }, { limit: 51 }, { limit: 0 }]) {
      const response = await admin.get('/api/admin/reports').query(query).expect(400);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
    }
    expect(
      (await admin.get('/api/admin/reports').query({ cursor: 'not-a-cursor' }).expect(400)).body.errorCode,
    ).toBe('INVALID_CURSOR');
    await reporter.get('/api/admin/reports').expect(403);
    await supertest(app.getHttpServer()).get('/api/admin/reports').expect(401);
  });
});
