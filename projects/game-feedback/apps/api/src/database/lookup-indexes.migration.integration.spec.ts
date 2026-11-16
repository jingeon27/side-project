import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';

const require = createRequire(import.meta.url);
const firstMigration = '20261027000000_lookup_indexes';
const indexes = [
  'Answer_authorId_idx',
  'Block_blockedUserId_idx',
  'Notification_answerId_idx',
  'Notification_postId_idx',
  'Post_authorId_createdAt_idx',
];

it('builds the lookup indexes on tables that already hold rows', async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const schema = `gf_test_lookup_index_${randomBytes(8).toString('hex')}`;
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();
  assertDatabaseUrl(databaseUrl, 'test');
  const fixture = mkdtempSync(join(tmpdir(), 'gf-index-migration-'));
  const prismaDir = fileURLToPath(new URL('../../prisma/', import.meta.url));
  const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
  function deploy() {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        join(fixture, 'schema.prisma'),
      ],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`Index migration failed: ${result.stderr}\n${result.stdout}`);
  }
  try {
    cpSync(prismaDir, fixture, {
      recursive: true,
      filter: (source) => !(/^\d{14}_/.test(basename(source)) && basename(source) >= firstMigration),
    });
    deploy();
    const [userId, otherId, categoryId, postId] = ['user', 'other', 'category', 'post'].map(
      (label) => `index-${label}-${randomBytes(6).toString('hex')}`,
    );
    for (const id of [userId, otherId])
      await db.$executeRaw`INSERT INTO "User" ("id", "nickname", "termsVersion", "ageConfirmed") VALUES (${id}, ${id}, '2026-10', true)`;
    await db.$executeRaw`INSERT INTO "Category" ("id", "slug", "name") VALUES (${categoryId}, ${categoryId}, '인덱스 게임')`;
    await db.$executeRaw`INSERT INTO "Post" ("id", "authorId", "categoryId", "title", "body", "updatedAt") VALUES (${postId}, ${userId}, ${categoryId}, '기존 글', '본문', NOW())`;
    await db.$executeRaw`INSERT INTO "Answer" ("id", "postId", "authorId", "body", "updatedAt") VALUES (${`${postId}-answer`}, ${postId}, ${otherId}, '답변', NOW())`;
    await db.$executeRaw`INSERT INTO "Notification" ("id", "postId", "userId", "answerId", "type") VALUES (${`${postId}-notice`}, ${postId}, ${userId}, ${`${postId}-answer`}, 'ANSWER')`;
    await db.$executeRaw`INSERT INTO "Block" ("id", "userId", "blockedUserId") VALUES (${`${postId}-block`}, ${userId}, ${otherId})`;
    cpSync(join(prismaDir, 'migrations'), join(fixture, 'migrations'), { recursive: true });
    deploy();
    const built = await db.$queryRaw<Array<{ name: string; valid: boolean }>>`
      SELECT c.relname AS "name", i.indisvalid AS "valid"
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relname = ANY(${indexes})
      ORDER BY c.relname`;
    expect(built).toEqual(indexes.map((name) => ({ name, valid: true })));
  } finally {
    if (!/^gf_test_lookup_index_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned migration schema');
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60000);
