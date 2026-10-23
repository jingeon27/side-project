import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
import { MediaStorage } from './media-storage.service';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_production_${randomBytes(8).toString('hex')}`;
const target = new URL(process.env.TEST_DATABASE_URL ?? 'http://unused');
target.searchParams.set('schema', schema);

describe('persistent private media and SSH operator sessions', () => {
  const state = {} as {
    db: PrismaClient;
    app: INestApplication;
    directory: string;
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
    state.directory = await mkdtemp(join(tmpdir(), 'game-feedback-media-'));
    state.app = await createApp({
      databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      rateLimit: false,
      mediaStorage: { driver: 'FILESYSTEM', directory: state.directory },
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
    if (state.directory) await rm(state.directory, { recursive: true });
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
    const upload = await request
      .post('/api/post-media')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${state.token}`)
      .attach('file', bytes, { filename: 'image.png', contentType: 'image/png' })
      .expect(200);
    const file = await state.db.postMedia.findUniqueOrThrow({
      where: { id: upload.body.id },
      include: { object: true },
    });
    expect(file.bytes).toBeNull();
    expect(file.object?.backend).toBe('FILESYSTEM');
    expect(await readFile(join(state.directory, file.object?.key ?? 'missing'))).toEqual(bytes);
    await request.get(upload.body.url).expect(404);
    const partial = await request
      .get(upload.body.url)
      .set('Authorization', `Bearer ${state.token}`)
      .set('Range', 'bytes=8-11')
      .expect(206);
    expect(partial.body).toEqual(bytes.subarray(8, 12));
    expect(partial.headers['content-range']).toBe(`bytes 8-11/${bytes.length}`);
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
    expect(await readFile(join(state.directory, file.object?.key ?? 'missing'))).toEqual(bytes);
    await state.db.mediaObject.update({
      where: { id: file.objectId ?? 'missing' },
      data: { retiredAt: new Date(Date.now() - 15 * 86400000) },
    });
    expect(await storage.prune()).toEqual({ removed: 1, failed: 0 });
    await expect(readFile(join(state.directory, file.object?.key ?? 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
