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
const migrationName = '20261022030000_comment_replies';

it('upgrades existing comments to root comments without losing their text', async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  const schema = `gf_test_reply_migration_${randomBytes(8).toString('hex')}`;
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();
  assertDatabaseUrl(databaseUrl, 'test');
  const fixture = mkdtempSync(join(tmpdir(), 'gf-comment-migration-'));
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
    if (result.status !== 0)
      throw new Error(`Legacy migration fixture failed: ${result.stderr}\n${result.stdout}`);
  }
  try {
    // 대상 migration과 그 뒤 폴더를 빼야 업그레이드 직전 스키마가 된다.
    cpSync(prismaDir, fixture, {
      recursive: true,
      filter: (source) => !(/^\d{14}_/.test(basename(source)) && basename(source) >= migrationName),
    });
    deploy();
    const user = await db.user.create({
      data: { nickname: '기존 댓글 작성자', termsVersion: '2026-10', ageConfirmed: true },
      // 업그레이드 전 DB에는 이후 추가된 User 컬럼이 없으므로 fixture의 키만 읽는다.
      select: { id: true },
    });
    const category = await db.category.create({ data: { slug: 'legacy-comment-game', name: '기존 게임' } });
    const post = await db.post.create({
      data: { authorId: user.id, categoryId: category.id, title: '기존 게시글', body: '기존 본문' },
    });
    const id = `legacy-${randomBytes(8).toString('hex')}`;
    await db.$executeRaw`INSERT INTO "Comment" ("id", "postId", "authorId", "body", "updatedAt") VALUES (${id}, ${post.id}, ${user.id}, ${'업그레이드 전 댓글'}, NOW())`;
    const notificationId = `legacy-notification-${randomBytes(8).toString('hex')}`;
    await db.$executeRaw`INSERT INTO "Notification" ("id", "postId", "userId", "type", "message") VALUES (${notificationId}, ${post.id}, ${user.id}, 'COMMENT', '기존 댓글 알림')`;
    cpSync(join(prismaDir, 'migrations'), join(fixture, 'migrations'), { recursive: true });
    deploy();
    expect(await db.comment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      id,
      parentId: null,
      body: '업그레이드 전 댓글',
      deletedAt: null,
    });
    expect(await db.notification.findUniqueOrThrow({ where: { id: notificationId } })).toMatchObject({
      commentId: null,
      type: 'COMMENT',
      message: '기존 댓글 알림',
    });
  } finally {
    if (!/^gf_test_reply_migration_[a-f0-9]+$/.test(schema)) throw new Error('Unowned migration schema');
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    rmSync(fixture, { recursive: true, force: true });
  }
}, 30000);
