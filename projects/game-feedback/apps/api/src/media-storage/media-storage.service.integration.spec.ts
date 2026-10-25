import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { grantOperatorRole, issueOperatorSession } from '../admin/operator-session';
import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl, hash } from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';
import { presignedUpload } from '../testing/media-upload';
import { S3Fixture } from '../testing/s3-fixture';
import { MediaStorage } from './media-storage.service';
import { migrateLegacyMedia } from './migrate-legacy-media';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_production_${randomBytes(8).toString('hex')}`;
const target = new URL(process.env.TEST_DATABASE_URL ?? 'http://unused');
target.searchParams.set('schema', schema);

describe('persistent private media and SSH operator sessions', () => {
  const s3 = new S3Fixture();
  const state = {} as {
    db: PrismaClient;
    app: INestApplication;
    userId: string;
    token: string;
  };
  beforeAll(async () => {
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    // Exercise the actual first production migration in a newly owned test schema.
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0)
      throw new Error(`Isolated production migration failed: ${migration.stdout}\n${migration.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(state.db, false);
    await s3.start();
    state.app = await createApp({
      databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      rateLimit: false,
      mediaStorage: s3.config,
    });
    state.userId = (
      await state.db.user.create({ data: { nickname: '실제운영자', termsVersion: 'v1', ageConfirmed: true } })
    ).id;
    await grantOperatorRole(state.db, state.userId);
    state.token = (await issueOperatorSession(state.db, state.userId)).accessToken;
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_production_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
    await s3.close();
  });
  it('issues a hashed, expiring operator session and rejects ordinary, test and banned accounts', async () => {
    const session = await state.db.session.findUniqueOrThrow({ where: { tokenHash: hash(state.token) } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(3500000);
    expect(session.tokenHash).not.toBe(state.token);
    expect(
      await state.db.auditLog.count({ where: { action: 'ISSUE_OPERATOR_SESSION', actorId: state.userId } }),
    ).toBe(1);
    const request = supertest(state.app.getHttpServer());
    await request.get('/api/admin/reports').set('Authorization', `Bearer ${state.token}`).expect(200);
    const user = await state.db.user.create({
      data: { nickname: '일반사용자', ageConfirmed: true, termsVersion: 'v1' },
    });
    await expect(issueOperatorSession(state.db, user.id)).rejects.toThrow();
    await state.db.user.update({ where: { id: user.id }, data: { demoKey: 'test-operator', role: 'ADMIN' } });
    await expect(grantOperatorRole(state.db, user.id)).rejects.toThrow();
    await expect(issueOperatorSession(state.db, user.id)).rejects.toThrow();
    await state.db.user.update({ where: { id: user.id }, data: { demoKey: null, bannedAt: new Date() } });
    await expect(issueOperatorSession(state.db, user.id)).rejects.toThrow();
  });
  it('keeps uploaded bytes outside PostgreSQL, enforces draft ownership, and serves byte ranges', async () => {
    const request = supertest(state.app.getHttpServer());
    const bytes = Buffer.from('89504e470d0a1a0a0001020304050607', 'hex');
    const actor = supertest.agent(state.app.getHttpServer()).set('Authorization', `Bearer ${state.token}`);
    const upload = await presignedUpload(actor, '/api/post-media', bytes, 'image/png', 'image.png');
    const file = await state.db.postMedia.findUniqueOrThrow({
      where: { id: upload.body.id },
      include: { object: true },
    });
    expect(file.bytes).toBeNull();
    expect(file.object?.backend).toBe('S3');
    expect(s3.objects.get(`/media-test/${file.object?.key}`)?.bytes).toEqual(bytes);
    await request.get(upload.body.url).expect(404);
    const partial = await request
      .get(upload.body.url)
      .set('Authorization', `Bearer ${state.token}`)
      .set('Range', 'bytes=8-11')
      .expect(307);
    const ranged = await fetch(responseLocation(partial), { headers: { Range: 'bytes=8-11' } });
    expect(ranged.status).toBe(206);
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(bytes.subarray(8, 12));
    expect(ranged.headers.get('content-range')).toBe(`bytes 8-11/${bytes.length}`);
    await request
      .delete(upload.body.url)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${state.token}`)
      .expect(200);
    const storage = state.app.get(MediaStorage);
    await state.db.mediaObject.update({
      where: { id: file.objectId ?? 'missing' },
      data: { createdAt: new Date(Date.now() - 2 * 86400000) },
    });
    expect(await storage.prune()).toEqual({ removed: 0, failed: 0 });
    // Seven-day backups can still restore a deleted object during the fourteen-day grace period.
    expect(s3.objects.get(`/media-test/${file.object?.key}`)?.bytes).toEqual(bytes);
    await state.db.mediaObject.update({
      where: { id: file.objectId ?? 'missing' },
      data: { retiredAt: new Date(Date.now() - 15 * 86400000) },
    });
    expect(await storage.prune()).toEqual({ removed: 1, failed: 0 });
    expect(s3.objects.has(`/media-test/${file.object?.key}`)).toBe(false);
  });
  it('migrates database and filesystem files only after S3 verification and can be rerun safely', async () => {
    const bytes = Buffer.from('legacy-file-content');
    const directory = await mkdtemp(join(tmpdir(), 'gf-legacy-'));
    try {
      const key = `objects/${randomUUID()}`;
      await mkdir(join(directory, 'objects'));
      await writeFile(join(directory, key), bytes);
      const object = await state.db.mediaObject.create({ data: { backend: 'FILESYSTEM', key } });
      const files = await Promise.all([
        state.db.postMedia.create({
          data: {
            uploaderId: state.userId,
            name: 'db.png',
            mimeType: 'image/png',
            size: bytes.length,
            bytes,
          },
        }),
        state.db.postMedia.create({
          data: {
            uploaderId: state.userId,
            name: 'fs.png',
            mimeType: 'image/png',
            size: bytes.length,
            objectId: object.id,
          },
        }),
      ]);
      await state.db.userAvatar.create({
        data: { userId: state.userId, mimeType: 'image/png', size: bytes.length, bytes },
      });
      const peer = await state.db.user.create({
        data: { nickname: '이행검사상대', termsVersion: 'v1', ageConfirmed: true },
      });
      const room = await state.db.chatConversation.create({
        data: { firstUserId: state.userId, secondUserId: peer.id },
      });
      const attachment = await state.db.chatAttachment.create({
        data: {
          conversationId: room.id,
          uploaderId: state.userId,
          name: 'chat.png',
          mimeType: 'image/png',
          size: bytes.length,
          bytes,
        },
      });
      expect(await migrateLegacyMedia(state.db, s3.config)).toEqual({ found: 4, migrated: 0, changed: 0 });
      expect(
        (await state.db.postMedia.findUniqueOrThrow({ where: { id: files[0]?.id } })).bytes,
      ).not.toBeNull();
      await expect(
        migrateLegacyMedia(
          state.db,
          { ...s3.config, endpoint: 'http://127.0.0.1:1' },
          { apply: true, directory },
        ),
      ).rejects.toThrow();
      expect(
        (await state.db.userAvatar.findUniqueOrThrow({ where: { userId: state.userId } })).bytes,
      ).not.toBeNull();
      expect(
        await migrateLegacyMedia(
          state.db,
          { ...s3.config, keyPrefix: 'game-feedback/local' },
          { apply: true, directory },
        ),
      ).toEqual({ found: 4, migrated: 4, changed: 0 });
      const rows = [
        ...(await state.db.postMedia.findMany({
          where: { id: { in: files.map((file) => file.id) } },
          include: { object: true },
        })),
        await state.db.userAvatar.findUniqueOrThrow({
          where: { userId: state.userId },
          include: { object: true },
        }),
        await state.db.chatAttachment.findUniqueOrThrow({
          where: { id: attachment.id },
          include: { object: true },
        }),
      ];
      for (const row of rows) {
        expect(row.bytes).toBeNull();
        expect(row.object?.backend).toBe('S3');
        expect(row.object?.key).toMatch(/^game-feedback\/local\/objects\//);
        expect(s3.objects.get(`/media-test/${row.object?.key}`)?.bytes).toEqual(bytes);
      }
      expect(await migrateLegacyMedia(state.db, s3.config, { apply: true, directory })).toEqual({
        found: 0,
        migrated: 0,
        changed: 0,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
