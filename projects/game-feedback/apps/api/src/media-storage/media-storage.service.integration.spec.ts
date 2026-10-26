import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl, hash, token } from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';
import { presignedUpload } from '../testing/media-upload';
import { S3TestStorage } from '../testing/s3';
import { MediaStorage } from './media-storage.service';
import { migrateLegacyMedia } from './migrate-legacy-media';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_production_${randomBytes(8).toString('hex')}`;
const target = new URL(process.env.DATABASE_URL ?? 'http://unused');
target.searchParams.set('schema', schema);

describe('persistent private media with a regular user session', () => {
  const s3 = new S3TestStorage();
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
    state.token = token();
    await state.db.session.create({
      data: { userId: state.userId, tokenHash: hash(state.token), expiresAt: new Date(Date.now() + 3600000) },
    });
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
    expect(await s3.read(file.object?.key ?? '')).toEqual(bytes);
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
    expect(await s3.read(file.object?.key ?? '')).toEqual(bytes);
    await state.db.mediaObject.update({
      where: { id: file.objectId ?? 'missing' },
      data: { retiredAt: new Date(Date.now() - 15 * 86400000) },
    });
    expect(await storage.prune()).toEqual({ removed: 1, failed: 0 });
    expect(await s3.exists(file.object?.key ?? '')).toBe(false);
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
      expect(await migrateLegacyMedia(state.db, s3.config, { apply: true, directory })).toEqual({
        found: 4,
        migrated: 4,
        changed: 0,
      });
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
        expect(row.object?.key.startsWith(`${s3.config.keyPrefix}/objects/`)).toBe(true);
        expect(await s3.read(row.object?.key ?? '')).toEqual(bytes);
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
