import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { POST_VIEW_RETENTION_MS, prunePostViews } from './post-views.repository';

const schema = `gf_test_view_ttl_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL ?? '');
url.searchParams.set('schema', schema);
const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const require = createRequire(import.meta.url);

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
    },
  );
  if (result.status !== 0)
    throw new Error(`View retention migration failed: ${result.stdout}\n${result.stderr}`);
});
afterAll(async () => {
  if (!/^gf_test_view_ttl_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned resource schema');
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});

it('48시간 지난 중복 방지 기록만 배치 삭제하고 누적 조회수·최근 방문은 보존한다', async () => {
  const user = await db.user.create({
    data: { nickname: '조회 정리', termsVersion: 'test', ageConfirmed: true },
  });
  const category = await db.category.create({ data: { slug: randomUUID(), name: '조회 정리' } });
  const post = await db.post.create({
    data: { categoryId: category.id, authorId: user.id, title: '조회 정리', body: '본문', viewCount: 123 },
  });
  const now = new Date();
  const cutoff = new Date(now.getTime() - POST_VIEW_RETENTION_MS);
  await db.postView.createMany({
    data: [
      ...['old-a', 'old-b', 'renewed'].map((visitorHash) => ({
        postId: post.id,
        visitorHash,
        lastViewedAt: new Date(cutoff.getTime() - 1),
      })),
      { postId: post.id, visitorHash: 'boundary', lastViewedAt: cutoff },
      { postId: post.id, visitorHash: 'fresh', lastViewedAt: now },
    ],
  });
  await db.postView.update({
    where: { postId_visitorHash: { postId: post.id, visitorHash: 'renewed' } },
    data: { lastViewedAt: now },
  });
  expect(await prunePostViews({ client: db, now, batchSize: 1 })).toBe(1);
  expect(await prunePostViews({ client: db, now })).toBe(1);
  expect(await prunePostViews({ client: db, now })).toBe(0);
  expect(
    (await db.postView.findMany({ where: { postId: post.id }, orderBy: { visitorHash: 'asc' } })).map(
      (v) => v.visitorHash,
    ),
  ).toEqual(['boundary', 'fresh', 'renewed']);
  expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).viewCount).toBe(123);
});
