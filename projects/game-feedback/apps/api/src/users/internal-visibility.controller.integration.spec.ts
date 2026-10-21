import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);
const requesterId = 'sample-user-0';
const coachId = 'sample-user-3';
type Agent = ReturnType<typeof supertest.agent>;

describe.skipIf(!testDatabaseUrl)('웹 서버 전용 제외 작성자 조회', () => {
  let app: INestApplication, db: PrismaClient, schema: string;
  let requester: Agent, coach: Agent;
  const login = (agent: Agent, accountId: string) =>
    agent.post('/api/auth/test-login').set('Origin', origin).send({ accountId }).expect(200);

  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    schema = `gf_test_visibility_${randomBytes(8).toString('hex')}`;
    target.searchParams.set('schema', schema);
    const databaseUrl = target.toString();
    assertDatabaseUrl(databaseUrl, 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0)
      throw new Error(`Isolated visibility schema setup failed: ${migration.stderr}\n${migration.stdout}`);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, true);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
    requester = supertest.agent(app.getHttpServer());
    coach = supertest.agent(app.getHttpServer());
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (db) {
      if (!/^gf_test_visibility_[a-f0-9]+$/.test(schema))
        throw new Error('Refusing to delete an unowned schema.');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  }, 15000);

  it('세션이 없으면 차단으로 제외할 작성자가 없어야 한다', async () => {
    const body = (
      await supertest(app.getHttpServer()).get('/_internal/visibility/excluded-authors').expect(200)
    ).body;
    expect(body).toEqual({ userIds: [] });
  });

  it('차단한 사람과 차단당한 사람 모두 서로를 제외해야 한다', async () => {
    await login(requester, requesterId);
    await login(coach, coachId);
    await coach.post('/api/blocks').set('Origin', origin).send({ blockedUserId: requesterId }).expect(200);
    try {
      expect((await coach.get('/_internal/visibility/excluded-authors').expect(200)).body).toEqual({
        userIds: [requesterId],
      });
      expect((await requester.get('/_internal/visibility/excluded-authors').expect(200)).body).toEqual({
        userIds: [coachId],
      });
    } finally {
      await coach.delete(`/api/blocks/${requesterId}`).set('Origin', origin).expect(200);
    }
    expect((await requester.get('/_internal/visibility/excluded-authors').expect(200)).body).toEqual({
      userIds: [],
    });
  });

  it('브라우저용 /api 경로에는 같은 정보를 두지 않아야 한다', async () => {
    await coach.get('/api/_internal/visibility/excluded-authors').expect(404);
  });
});
