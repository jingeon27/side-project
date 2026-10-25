import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { hash, token } from '../../common/crypto';
import { assertDatabaseUrl } from '../../database/database-url';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { presignedUpload } from '../../testing/media-upload';
import { createAdminAccount, resetAdminPassword } from './admin-account';

const require = createRequire(import.meta.url);
const schema = `gf_test_admin_auth_${randomUUID().replaceAll('-', '')}`;
const origin = 'http://localhost:3300';
const password = 'isolated-admin-password';
const state = {} as {
  app: INestApplication;
  db: PrismaClient;
  userId: string;
  publicToken: string;
  adminId: string;
};
function request() {
  return supertest(state.app.getHttpServer());
}
async function login(username = 'operator', suppliedPassword = password) {
  return request()
    .post('/api/admin/auth/login')
    .set('Origin', origin)
    .send({ username, password: suppliedPassword });
}
function adminCookie(response: { headers: Record<string, unknown> }) {
  const value = String(response.headers['set-cookie']).split(';')[0];
  if (!value) throw new Error('Admin cookie missing');
  return value;
}
describe('dedicated administrator credentials and private sessions', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migrated = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migrated.status !== 0) throw new Error('Isolated admin migration failed');
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    state.app = await createApp({
      databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      demoMode: false,
      testAuthEnabled: false,
      rateLimit: false,
    });
    const account = await createAdminAccount(state.db, 'operator', password);
    state.adminId = account.userId;
    const user = await state.db.user.create({
      data: { nickname: '일반 사용자', termsVersion: 'test', ageConfirmed: true },
    });
    state.userId = user.id;
    state.publicToken = token();
    await state.db.session.create({
      data: { userId: user.id, tokenHash: hash(state.publicToken), expiresAt: new Date(Date.now() + 60000) },
    });
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (!state.db) return;
    if (!/^gf_test_admin_auth_[a-f0-9]{32}$/.test(schema)) throw new Error('Unowned admin schema');
    await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await state.db.$disconnect();
  });
  it('creates a separate identity, hashes passwords, and rejects wrong credentials and foreign origins', async () => {
    const account = await state.db.adminAccount.findUniqueOrThrow({
      where: { username: 'operator' },
      include: { user: true },
    });
    expect(account.passwordHash).not.toContain(password);
    expect(account.userId).not.toBe(state.userId);
    expect(account.user).toMatchObject({ role: 'ADMIN', googleSubject: null, demoKey: null });
    expect((await login('operator', 'wrong-password')).status).toBe(401);
    expect((await login('missing-admin')).body).toEqual((await login('operator', 'wrong-password')).body);
    await request()
      .post('/api/admin/auth/login')
      .set('Origin', 'https://foreign.example')
      .send({ username: 'operator', password })
      .expect(403);
    await request()
      .post('/api/admin/auth/login')
      .set('Origin', origin)
      .send({ username: 'operator', password: 'short' })
      .expect(400);
    await request()
      .post('/api/admin/auth/register')
      .set('Origin', origin)
      .send({ username: 'other', password })
      .expect(404);
  });
  it('keeps public and admin cookies independent and never authenticates the public API with an admin identity', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Strict');
    expect(String(response.headers['set-cookie'])).toContain('Path=/api/admin');
    expect(String(response.headers['set-cookie'])).not.toContain('gamefeedback_session=');
    const cookie = adminCookie(response);
    expect((await request().get('/api/admin/auth/session').set('Cookie', cookie)).body.user.id).toBe(
      state.adminId,
    );
    expect((await request().get('/api/session').set('Cookie', cookie)).body.user).toBeNull();
    const combined = `${cookie}; gamefeedback_session=${state.publicToken}`;
    expect((await request().get('/api/session').set('Cookie', combined)).body.user.id).toBe(state.userId);
    expect((await request().get('/api/admin/auth/session').set('Cookie', combined)).body.user.id).toBe(
      state.adminId,
    );
    const raw = cookie.split('=')[1] ?? '';
    expect((await request().get('/api/session').set('Authorization', `Bearer ${raw}`)).body.user).toBeNull();
    const row = await state.db.adminSession.findUniqueOrThrow({ where: { tokenHash: hash(raw) } });
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(3500000);
    await request().post('/api/admin/auth/logout').set('Cookie', combined).set('Origin', origin).expect(200);
    expect((await request().get('/api/admin/auth/session').set('Cookie', cookie)).body.user).toBeNull();
    expect((await request().get('/api/session').set('Cookie', combined)).body.user.id).toBe(state.userId);
  });
  it('routes profile verification to the dedicated admin inbox and permits replies and approval only there', async () => {
    const user = supertest
      .agent(state.app.getHttpServer())
      .set('Authorization', `Bearer ${state.publicToken}`);
    const created = await user
      .post('/api/support/conversations')
      .set('Origin', origin)
      .send({ topic: 'VERIFICATION' })
      .expect(200);
    const cookie = adminCookie(await login());
    const threads = await request().get('/api/admin/support').set('Cookie', cookie).expect(200);
    expect(threads.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: created.body.id,
          adminId: state.adminId,
          topic: 'VERIFICATION',
        }),
      ]),
    );
    const path = `/api/admin/support/${created.body.id}/messages`;
    await request()
      .post(path)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ body: '게임 프로필을 확인하겠습니다.', clientMessageId: randomUUID() })
      .expect(200);
    expect(
      (await user.get(`/api/conversations/${created.body.id}/messages`).expect(200)).body.items[0].body,
    ).toBe('게임 프로필을 확인하겠습니다.');
    await request().get(`/api/conversations/${created.body.id}/messages`).set('Cookie', cookie).expect(401);
    await user.get(`/api/users/${state.adminId}`).expect(404);
    await user
      .post('/api/conversations')
      .set('Origin', origin)
      .send({ recipientId: state.adminId })
      .expect(404);
    const bytes = Buffer.from('89504e470d0a1a0a00010203', 'hex');
    const uploaded = await presignedUpload(
      user,
      `/api/conversations/${created.body.id}/attachments`,
      bytes,
      'image/png',
      'evidence.png',
    );
    await user
      .post(`/api/conversations/${created.body.id}/messages`)
      .set('Origin', origin)
      .send({ body: '인증 자료', attachmentIds: [uploaded.body.id], clientMessageId: randomUUID() })
      .expect(200);
    const history = await request().get(path).set('Cookie', cookie).expect(200);
    const file = history.body.items
      .flatMap((message: { attachments: { id: string; url: string }[] }) => message.attachments)
      .find((attachment: { id: string }) => attachment.id === uploaded.body.id);
    expect(file.url).toContain('/api/admin/support/');
    await request().get(file.url).set('Cookie', cookie).expect(307);
    await user.get(file.url).expect(403);

    await user.get(path).expect(403);
    await request().get('/api/admin/support/unknown/messages').set('Cookie', cookie).expect(404);
    await request()
      .patch(`/api/admin/users/${state.userId}/verification`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ isVerified: true })
      .expect(200);
    expect((await user.get('/api/session')).body.user.isVerified).toBe(true);
  });
  it('revokes sessions on password reset, expiry and account disable', async () => {
    const cookie = adminCookie(await login());
    await resetAdminPassword(state.db, 'operator', 'changed-admin-password');
    expect((await request().get('/api/admin/auth/session').set('Cookie', cookie)).body.user).toBeNull();
    expect((await login()).status).toBe(401);
    const fresh = adminCookie(await login('operator', 'changed-admin-password'));
    await state.db.adminSession.updateMany({ data: { expiresAt: new Date(0) } });
    expect((await request().get('/api/admin/auth/session').set('Cookie', fresh)).body.user).toBeNull();
    const active = adminCookie(await login('operator', 'changed-admin-password'));
    await state.db.adminAccount.update({ where: { username: 'operator' }, data: { disabledAt: new Date() } });
    expect((await request().get('/api/admin/auth/session').set('Cookie', active)).body.user).toBeNull();
    expect((await login('operator', 'changed-admin-password')).status).toBe(401);
  });
});
