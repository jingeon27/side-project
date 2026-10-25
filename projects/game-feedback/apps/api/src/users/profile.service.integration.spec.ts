import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { hash, token } from '../common/crypto';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { MediaStorage } from '../media-storage/media-storage.service';
import { assertDatabaseUrl } from '../security';
import { responseLocation } from '../testing/http-response';
import { transferMedia } from '../testing/media-upload';
import { S3Fixture } from '../testing/s3-fixture';

const require = createRequire(import.meta.url);
const schema = `gf_test_profile_${randomBytes(8).toString('hex')}`;
const origin = 'http://localhost:3300';
describe('프로필 링크와 사진 HTTP 통합', () => {
  const s3 = new S3Fixture();
  const state = {} as {
    app: INestApplication;
    db: PrismaClient;
    userId: string;
    otherId: string;
    accessToken: string;
    otherToken: string;
    photo: Buffer;
  };
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? 'http://unused');
    target.searchParams.set('schema', schema);
    const url = assertDatabaseUrl(target.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(url) });
    await s3.start();
    state.app = await createApp({
      databaseUrl: url,
      prisma: state.db,
      webOrigin: origin,
      rateLimit: false,
      mediaStorage: s3.config,
    });
    const user = await state.db.user.create({
      data: { nickname: '프로필 작성자', termsVersion: 'v1', ageConfirmed: true },
    });
    state.userId = user.id;
    const other = await state.db.user.create({
      data: { nickname: '프로필 방문자', termsVersion: 'v1', ageConfirmed: true },
    });
    state.otherId = other.id;
    state.accessToken = token();
    state.otherToken = token();
    for (const [userId, value] of [
      [user.id, state.accessToken],
      [other.id, state.otherToken],
    ] as const)
      await state.db.session.create({
        data: { userId, tokenHash: hash(value), expiresAt: new Date(Date.now() + 3_600_000) },
      });
    state.photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#2255cc' } })
      .jpeg()
      .toBuffer();
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
    await s3.close();
  });
  const http = () => supertest(state.app.getHttpServer());
  const authenticated = () =>
    http().patch('/api/profile').set('Authorization', `Bearer ${state.accessToken}`).set('Origin', origin);
  async function reserve(bytes = state.photo, mimeType = 'image/jpeg') {
    const response = await http()
      .post('/api/profile/avatar/uploads')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .send({ name: 'photo.jpg', mimeType, size: bytes.length })
      .expect(200);
    return MediaUploadPlanSchema.parse(response.body);
  }
  async function upload(bytes = state.photo, mimeType = 'image/jpeg', status = 200) {
    const plan = await reserve(bytes, mimeType);
    expect((await transferMedia(plan, bytes, mimeType)).status).toBe(204);
    return http()
      .post(`/api/profile/avatar/uploads/${plan.id}/complete`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(status);
  }
  it('비로그인 변경·업로드와 잘못된 Origin을 차단한다', async () => {
    await http().patch('/api/profile').set('Origin', origin).send({ links: [] }).expect(401);
    await http()
      .post('/api/profile/avatar/uploads')
      .set('Origin', origin)
      .send({ name: 'photo.jpg', mimeType: 'image/jpeg', size: state.photo.length })
      .expect(401);
    await http()
      .patch('/api/profile')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', 'https://evil.test')
      .send({ links: [] })
      .expect(403);
  });
  it('내 링크만 변경하고 공개 프로필에 이름·주소를 제공한다', async () => {
    const links = [{ label: '내 방송', url: 'https://video.example/@player' }];
    await authenticated().send({ links }).expect(200);
    const result = await http().get(`/api/users/${state.userId}`).expect(200);
    expect(result.body.links).toEqual(links);
    await authenticated().send({ links: [], userId: state.otherId }).expect(400);
    expect((await state.db.user.findUniqueOrThrow({ where: { id: state.otherId } })).profileLinks).toEqual(
      [],
    );
  });
  it('스크립트·계정정보 URL, 잘못된 필드와 링크 상한을 거부한다', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@site.test'])
      await authenticated()
        .send({ links: [{ label: '링크', url }] })
        .expect(400);
    await authenticated()
      .send({ links: Array.from({ length: 6 }, () => ({ label: '링크', url: 'https://site.test' })) })
      .expect(400);
    await authenticated()
      .send({ links: [{ label: 'x'.repeat(41), url: 'https://site.test' }] })
      .expect(400);
  });
  it('S3 사진의 버전 URL을 공개하고 DB에는 바이트를 저장하지 않는다', async () => {
    const result = await upload();
    const url = result.body.author.avatarUrl as string;
    expect(url).toMatch(/\/avatar\?v=/);
    const redirect = await http().get(url).expect(307);
    expect(redirect.headers['cache-control']).toBe('private, no-store');
    const file = await fetch(responseLocation(redirect));
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(state.photo);
    const stored = await state.db.userAvatar.findUniqueOrThrow({
      where: { userId: state.userId },
      include: { object: true },
    });
    expect(stored.bytes).toBeNull();
    expect(stored.object?.backend).toBe('S3');
    const session = await http()
      .get('/api/session')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);
    expect(session.body.user.avatarUrl).toBe(url);
    const replaced = await upload();
    expect(replaced.body.author.avatarUrl).not.toBe(url);
    expect(await state.db.userAvatar.count({ where: { userId: state.userId } })).toBe(1);
  });
  it('확장자·MIME만 위장한 파일을 확정하지 않는다', async () => {
    await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 400);
    await upload(Buffer.from('not-image'), 'image/webp', 400);
  });
  it('예약 소유권과 만료를 검사하고 완료 재시도는 같은 사진을 반환한다', async () => {
    const plan = await reserve();
    const path = `/api/profile/avatar/uploads/${plan.id}/complete`;
    await http()
      .post(path)
      .set('Authorization', `Bearer ${state.otherToken}`)
      .set('Origin', origin)
      .expect(404);
    await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(400);
    expect((await transferMedia(plan, state.photo, 'image/jpeg')).status).toBe(204);
    const completed = await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    const retried = await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    expect(retried.body.author.avatarUrl).toBe(completed.body.author.avatarUrl);
    const expired = await reserve();
    await state.db.avatarUpload.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post(`/api/profile/avatar/uploads/${expired.id}/complete`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(409);
  });
  it('차단된 방문자에게 사진과 공개 프로필을 함께 숨긴다', async () => {
    await state.db.block.create({ data: { userId: state.otherId, blockedUserId: state.userId } });
    for (const path of [`/api/users/${state.userId}`, `/api/users/${state.userId}/avatar`])
      await http().get(path).set('Authorization', `Bearer ${state.otherToken}`).expect(404);
    await state.db.block.deleteMany({ where: { userId: state.otherId } });
  });
  it('정리 작업은 사용 중인 사진을 유지하고 삭제 시 기본 아바타로 복원한다', async () => {
    const live = await state.db.userAvatar.findUniqueOrThrow({ where: { userId: state.userId } });
    await state.db.mediaObject.updateMany({
      where: { id: live.objectId ?? '' },
      data: {
        createdAt: new Date(Date.now() - 30 * 86400000),
        retiredAt: new Date(Date.now() - 20 * 86400000),
      },
    });
    await state.app.get(MediaStorage).prune();
    await http().get(`/api/users/${state.userId}/avatar`).expect(307);
    const result = await http()
      .delete('/api/profile/avatar')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    expect(result.body.author.avatarUrl).toBeNull();
    await http().get(`/api/users/${state.userId}/avatar`).expect(404);
  });
});
